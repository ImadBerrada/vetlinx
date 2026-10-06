import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../platform/persistence/prisma.service';
import {
  OUTBOX_WRITER,
  type OutboxWriter,
} from '../../platform/events/outbox-writer.port';
import { AuditService } from '../audit/audit.service';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../identity/password-hasher.port';
import {
  NOTIFICATIONS_PUBLIC_API,
  type NotificationsPublicApi,
} from '../notifications/notifications.public';

const RESET_MESSAGE =
  'If an active account uses that email, a password reset link will be sent. Check your inbox and spam folder.';
const INVALID_LINK = 'This link is invalid or has expired. Request a new link.';

@Injectable()
export class IdentitySecurityService {
  private readonly logger = new Logger(IdentitySecurityService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(NOTIFICATIONS_PUBLIC_API)
    private readonly notifications: NotificationsPublicApi,
  ) {}

  async requestPasswordReset(emailInput: string, correlationId: string) {
    const startedAt = performance.now();
    try {
      const account = await this.prisma.account.findUnique({
        where: { email: emailInput.trim().toLocaleLowerCase('en-US') },
        select: { id: true, status: true },
      });
      if (account?.status === 'ACTIVE')
        await this.issue(account.id, 'PASSWORD_RESET', correlationId);
    } catch {
      // Do not distinguish delivery/database failures for an existing account.
      this.logger.warn('IDENTITY_RECOVERY_ENQUEUE_FAILED');
    } finally {
      const wait = Math.max(0, 250 - (performance.now() - startedAt));
      if (wait > 0)
        await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }
    return { message: RESET_MESSAGE };
  }

  async requestEmailVerification(accountId: string, correlationId: string) {
    await this.issue(accountId, 'EMAIL_VERIFY', correlationId);
    return {
      message:
        'If your email still needs verification, a link will be sent. Check your inbox and spam folder.',
    };
  }

  security(accountId: string) {
    return this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { email: true, emailVerifiedAt: true },
    });
  }

  async completePasswordReset(
    token: string,
    password: string,
    correlationId: string,
  ) {
    // Expensive hashing is done before acquiring database locks, even for invalid links.
    const passwordHash = await this.passwords.hash(password);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const securityToken = await this.consume(
        tx,
        token,
        'PASSWORD_RESET',
        now,
      );
      await tx.account.update({
        where: { id: securityToken.accountId },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.refreshSession.updateMany({
        where: { accountId: securityToken.accountId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.securityToken.updateMany({
        where: {
          accountId: securityToken.accountId,
          purpose: 'PASSWORD_RESET',
          usedAt: null,
        },
        data: { usedAt: now },
      });
      await this.audit.recordInTransaction(tx, {
        actorId: securityToken.accountId,
        action: 'identity.password.reset',
        resourceType: 'account',
        resourceId: securityToken.accountId,
        occurredAt: now.toISOString(),
        correlationId,
        changes: { sessionsRevoked: true },
      });
      await this.outbox.enqueue(tx, [
        {
          id: randomUUID(),
          name: 'AccountPasswordReset',
          version: 1,
          aggregateId: securityToken.accountId,
          occurredAt: now.toISOString(),
          correlationId,
          payload: { accountId: securityToken.accountId },
        },
      ]);
      const account = await tx.account.findUniqueOrThrow({
        where: { id: securityToken.accountId },
        select: { email: true },
      });
      await this.notifications.enqueueEmail(tx, {
        idempotencyKey: `password-updated:${securityToken.id}`,
        to: account.email,
        subject: 'Your VetLinX password was changed',
        text: `Your VetLinX password was updated and all devices were signed out. If you did not make this change, use ${new URL('/forgot-password', this.config.getOrThrow<string>('FRONTEND_ORIGIN')).toString()} to secure your account and contact support.`,
        sensitive: false,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
      });
    });
    return {
      message:
        'Password updated. All sessions have been signed out. Sign in with your new password.',
    };
  }

  async completeEmailVerification(token: string, correlationId: string) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const securityToken = await this.consume(tx, token, 'EMAIL_VERIFY', now);
      await tx.account.update({
        where: { id: securityToken.accountId },
        data: { emailVerifiedAt: now },
      });
      await tx.securityToken.updateMany({
        where: {
          accountId: securityToken.accountId,
          purpose: 'EMAIL_VERIFY',
          usedAt: null,
        },
        data: { usedAt: now },
      });
      await this.audit.recordInTransaction(tx, {
        actorId: securityToken.accountId,
        action: 'identity.email.verified',
        resourceType: 'account',
        resourceId: securityToken.accountId,
        occurredAt: now.toISOString(),
        correlationId,
      });
      await this.outbox.enqueue(tx, [
        {
          id: randomUUID(),
          name: 'EmailVerified',
          version: 1,
          aggregateId: securityToken.accountId,
          occurredAt: now.toISOString(),
          correlationId,
          payload: { accountId: securityToken.accountId },
        },
      ]);
    });
    return {
      message: 'Your email is verified. You can return to your workspace.',
    };
  }

  async sessions(accountId: string, currentFamilyId?: string) {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { accountId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        familyId: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      distinct: ['familyId'],
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return sessions.map(({ familyId, userAgent, createdAt, expiresAt }) => ({
      id: familyId,
      device: this.describeDevice(userAgent),
      lastActiveAt: createdAt,
      expiresAt,
      current: familyId === currentFamilyId,
    }));
  }

  async revokeSession(
    accountId: string,
    familyId: string,
    correlationId: string,
    currentFamilyId?: string,
  ) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, accountId);
      const session = await tx.refreshSession.findFirst({
        where: { accountId, familyId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Session not found');
      const changed = await tx.refreshSession.updateMany({
        where: { accountId, familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      if (!changed.count) return;
      // Access tokens are bound to the refresh family, so other devices stay valid.
      await this.audit.recordInTransaction(tx, {
        actorId: accountId,
        action: 'identity.session.family_revoked',
        resourceType: 'refresh_family',
        resourceId: familyId,
        occurredAt: now.toISOString(),
        correlationId,
      });
    });
    return {
      message: 'Session signed out.',
      signedOutCurrent: familyId === currentFamilyId,
    };
  }

  async revokeAll(accountId: string, correlationId: string) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, accountId);
      await tx.refreshSession.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.account.update({
        where: { id: accountId },
        data: { authVersion: { increment: 1 } },
      });
      await this.audit.recordInTransaction(tx, {
        actorId: accountId,
        action: 'identity.sessions.all_revoked',
        resourceType: 'account',
        resourceId: accountId,
        occurredAt: now.toISOString(),
        correlationId,
      });
    });
    return { message: 'All devices signed out. Sign in again to continue.' };
  }

  private async issue(
    accountId: string,
    purpose: 'PASSWORD_RESET' | 'EMAIL_VERIFY',
    correlationId: string,
  ) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, accountId);
      const account = await tx.account.findUnique({
        where: { id: accountId },
        select: { email: true, status: true, emailVerifiedAt: true },
      });
      if (
        !account ||
        account.status !== 'ACTIVE' ||
        (purpose === 'EMAIL_VERIFY' && account.emailVerifiedAt)
      )
        return;
      const recent = await tx.securityToken.findFirst({
        where: {
          accountId,
          purpose,
          createdAt: { gt: new Date(now.getTime() - 60_000) },
        },
        select: { id: true },
      });
      if (recent) return;
      const token = randomBytes(48).toString('hex');
      const lifetimeMinutes = purpose === 'PASSWORD_RESET' ? 30 : 24 * 60;
      const stored = await tx.securityToken.create({
        data: {
          accountId,
          purpose,
          tokenHash: this.hashToken(token),
          expiresAt: new Date(now.getTime() + lifetimeMinutes * 60_000),
        },
      });
      const link = new URL(
        purpose === 'PASSWORD_RESET' ? '/reset-password' : '/verify-email',
        this.config.getOrThrow<string>('FRONTEND_ORIGIN'),
      );
      // Fragments are never sent in the browser's initial request or access logs.
      link.hash = new URLSearchParams({ token }).toString();
      const resetting = purpose === 'PASSWORD_RESET';
      await this.notifications.enqueueEmail(tx, {
        idempotencyKey: `security:${stored.id}`,
        to: account.email,
        subject: resetting
          ? 'Reset your VetLinX password'
          : 'Verify your VetLinX email',
        text: `${resetting ? 'Reset your password' : 'Verify your email'} using this link:\n${link.toString()}\n\nThis link expires in ${resetting ? '30 minutes' : '24 hours'} and works once. If you did not request this, you can ignore this message.`,
        sensitive: true,
        expiresAt: new Date(now.getTime() + lifetimeMinutes * 60_000),
      });
      await this.audit.recordInTransaction(tx, {
        actorId: accountId,
        action: resetting
          ? 'identity.password_reset.requested'
          : 'identity.email_verification.requested',
        resourceType: 'account',
        resourceId: accountId,
        occurredAt: now.toISOString(),
        correlationId,
      });
    });
  }

  private async consume(
    tx: Prisma.TransactionClient,
    token: string,
    purpose: 'PASSWORD_RESET' | 'EMAIL_VERIFY',
    now: Date,
  ) {
    const found = await tx.securityToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
      select: { id: true, accountId: true, purpose: true },
    });
    if (!found || found.purpose !== purpose)
      throw new BadRequestException(INVALID_LINK);
    await this.lockAccount(tx, found.accountId);
    const account = await tx.account.findUnique({
      where: { id: found.accountId },
      select: { status: true },
    });
    if (account?.status !== 'ACTIVE')
      throw new BadRequestException(INVALID_LINK);
    const used = await tx.securityToken.updateMany({
      where: { id: found.id, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (used.count !== 1) throw new BadRequestException(INVALID_LINK);
    return found;
  }

  private async lockAccount(tx: Prisma.TransactionClient, accountId: string) {
    const accounts = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "identity"."accounts" WHERE "id" = ${accountId}::uuid FOR UPDATE`;
    if (!accounts.length) throw new UnauthorizedException();
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private describeDevice(userAgent: string | null) {
    if (!userAgent) return 'Unknown browser or device';
    const browser = /Edg\//.test(userAgent)
      ? 'Edge'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser';
    const device = /iPhone/.test(userAgent)
      ? 'iPhone'
      : /iPad/.test(userAgent)
        ? 'iPad'
        : /Android/.test(userAgent)
          ? 'Android'
          : /Windows/.test(userAgent)
            ? 'Windows'
            : /Macintosh/.test(userAgent)
              ? 'Mac'
              : /Linux/.test(userAgent)
                ? 'Linux'
                : 'unknown device';
    return `${browser} on ${device}`;
  }
}
