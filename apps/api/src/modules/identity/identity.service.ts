import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../platform/persistence/prisma.service';
import {
  OUTBOX_WRITER,
  type OutboxWriter,
} from '../../platform/events/outbox-writer.port';
import { AuthTokenService } from './auth-token.service';
import type { AuthenticationResult, RequestMetadata } from './identity.types';
import { PASSWORD_HASHER, type PasswordHasher } from './password-hasher.port';
import type { AccountStatus } from './identity.public';

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: AuthTokenService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
  ) {}

  async getAccountStatus(accountId: string): Promise<AccountStatus | null> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { status: true },
    });
    return account ? (account.status.toLowerCase() as AccountStatus) : null;
  }

  async findEmailRecipients(accountIds: string[]) {
    const accounts = await this.prisma.account.findMany({
      where: {
        id: { in: accountIds },
        status: 'ACTIVE',
        emailVerifiedAt: { not: null },
      },
      select: { id: true, email: true },
    });
    return accounts.map((account) => ({
      accountId: account.id,
      email: account.email,
    }));
  }

  async getCurrentAccount(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        status: true,
        emailVerifiedAt: true,
        systemRoles: { select: { role: true }, orderBy: { role: 'asc' } },
      },
    });
    if (!account || account.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }
    return {
      accountId: account.id,
      email: account.email,
      emailVerifiedAt: account.emailVerifiedAt,
      roles: account.systemRoles.map(({ role }) => role),
    };
  }

  async register(
    emailInput: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<AuthenticationResult> {
    const email = this.normalizeEmail(emailInput);
    const existing = await this.prisma.account.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account already exists');

    const id = randomUUID();
    const passwordHash = await this.passwords.hash(password);
    const refresh = this.tokens.generateRefreshToken();
    const refreshFamilyId = randomUUID();
    const occurredAt = new Date();

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.account.create({
          data: { id, email, passwordHash, status: 'ACTIVE' },
        });
        await transaction.refreshSession.create({
          data: {
            accountId: id,
            familyId: refreshFamilyId,
            tokenHash: refresh.hash,
            expiresAt: refresh.expiresAt,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
          },
        });
        await this.audit.recordInTransaction(transaction, {
          actorId: id,
          action: 'identity.account.registered',
          resourceType: 'account',
          resourceId: id,
          occurredAt: occurredAt.toISOString(),
          correlationId: metadata.correlationId,
        });
        await this.outbox.enqueue(transaction, [
          {
            id: randomUUID(),
            name: 'AccountRegistered',
            version: 1,
            occurredAt: occurredAt.toISOString(),
            aggregateId: id,
            correlationId: metadata.correlationId,
            payload: { accountId: id, email },
          },
        ]);
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('An account already exists');
      }
      throw error;
    }

    return this.authenticationResult(
      id,
      email,
      'ACTIVE',
      refresh.token,
      0,
      refreshFamilyId,
    );
  }

  async login(
    emailInput: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<AuthenticationResult> {
    const email = this.normalizeEmail(emailInput);
    const account = await this.prisma.account.findUnique({ where: { email } });
    if (!account) {
      await this.passwords.hash(password);
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await this.passwords.verify(account.passwordHash, password);
    if (!valid || account.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid email or password');
    }

    const refresh = this.tokens.generateRefreshToken();
    const refreshFamilyId = randomUUID();
    const occurredAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM identity.accounts WHERE id = ${account.id}::uuid FOR UPDATE`;
      const locked = await transaction.account.findUnique({
        where: { id: account.id },
      });
      if (
        !locked ||
        locked.status !== 'ACTIVE' ||
        locked.passwordHash !== account.passwordHash ||
        locked.authVersion !== account.authVersion
      )
        throw new UnauthorizedException('Invalid email or password');
      await transaction.refreshSession.create({
        data: {
          accountId: account.id,
          familyId: refreshFamilyId,
          tokenHash: refresh.hash,
          expiresAt: refresh.expiresAt,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: account.id,
        action: 'identity.session.created',
        resourceType: 'account',
        resourceId: account.id,
        occurredAt: occurredAt.toISOString(),
        correlationId: metadata.correlationId,
      });
    });

    return this.authenticationResult(
      account.id,
      account.email,
      account.status,
      refresh.token,
      account.authVersion,
      refreshFamilyId,
    );
  }

  async refresh(
    refreshToken: string,
    metadata: RequestMetadata,
  ): Promise<AuthenticationResult> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const replacement = this.tokens.generateRefreshToken();
    const replacementId = randomUUID();
    const now = new Date();

    const account = await this.prisma.$transaction(async (transaction) => {
      const initial = await transaction.refreshSession.findUnique({
        where: { tokenHash },
        select: { accountId: true },
      });
      if (!initial) return null;
      await transaction.$queryRaw`SELECT id FROM identity.accounts WHERE id = ${initial.accountId}::uuid FOR UPDATE`;
      const current = await transaction.refreshSession.findUnique({
        where: { tokenHash },
        include: { account: true },
      });
      if (!current || current.account.status !== 'ACTIVE') {
        return null;
      }
      if (current.revokedAt || current.expiresAt <= now) {
        if (current.replacedById) {
          await transaction.refreshSession.updateMany({
            where: { familyId: current.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
          await this.audit.recordInTransaction(transaction, {
            actorId: current.accountId,
            action: 'identity.session.replay_detected',
            resourceType: 'refresh_session',
            resourceId: current.id,
            occurredAt: now.toISOString(),
            correlationId: metadata.correlationId,
            reason: 'A previously rotated refresh token was reused',
          });
        }
        return null;
      }

      const rotated = await transaction.refreshSession.updateMany({
        where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now, replacedById: replacementId },
      });
      if (rotated.count !== 1) return null;

      await transaction.refreshSession.create({
        data: {
          id: replacementId,
          accountId: current.accountId,
          familyId: current.familyId,
          tokenHash: replacement.hash,
          expiresAt: replacement.expiresAt,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: current.accountId,
        action: 'identity.session.rotated',
        resourceType: 'refresh_session',
        resourceId: current.id,
        occurredAt: now.toISOString(),
        correlationId: metadata.correlationId,
      });
      return { ...current.account, sessionFamilyId: current.familyId };
    });

    if (!account) throw new UnauthorizedException('Invalid refresh token');

    return this.authenticationResult(
      account.id,
      account.email,
      account.status,
      replacement.token,
      account.authVersion,
      account.sessionFamilyId,
    );
  }

  async logout(refreshToken: string, metadata: RequestMetadata): Promise<void> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });
    if (!session) return;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM identity.accounts WHERE id = ${session.accountId}::uuid FOR UPDATE`;
      const revoked = await transaction.refreshSession.updateMany({
        where: {
          accountId: session.accountId,
          familyId: session.familyId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (!revoked.count) return;
      await this.audit.recordInTransaction(transaction, {
        actorId: session.accountId,
        action: 'identity.session.revoked',
        resourceType: 'refresh_session',
        resourceId: session.id,
        occurredAt: new Date().toISOString(),
        correlationId: metadata.correlationId,
      });
    });
  }

  private async authenticationResult(
    id: string,
    email: string,
    status: string,
    refreshToken: string,
    authVersion: number,
    sessionFamilyId: string,
  ): Promise<AuthenticationResult> {
    const assignments = await this.prisma.accountSystemRole.findMany({
      where: { accountId: id },
      select: { role: true },
      orderBy: { role: 'asc' },
    });
    return {
      accessToken: await this.tokens.signAccessToken({
        accountId: id,
        email,
        authVersion,
        sessionFamilyId,
      }),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTokenTtlSeconds,
      account: {
        id,
        email,
        status,
        roles: assignments.map(({ role }) => role),
      },
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLocaleLowerCase('en-US');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
