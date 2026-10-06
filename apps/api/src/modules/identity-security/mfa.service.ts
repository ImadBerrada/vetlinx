import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import type { Account, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../platform/persistence/prisma.service';
import { MailQueueService } from '../../platform/delivery/mail-queue.service';
import { AuditService } from '../audit/audit.service';
import {
  OUTBOX_WRITER,
  type OutboxWriter,
} from '../../platform/events/outbox-writer.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../identity/password-hasher.port';
import type { RequestMetadata } from '../identity/identity.types';

export const MFA_RECENCY_MS = 15 * 60_000;
const ENCRYPTION_CONTEXT = 'identity-mfa-secret';
const INVALID_CODE =
  'This code is invalid, expired, or already used. Use the next authenticator code or an unused recovery code.';

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: MailQueueService,
    private readonly audit: AuditService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
  ) {}

  async status(accountId: string, familyId: string) {
    const [account, family, recoveryCodes, roles] = await Promise.all([
      this.prisma.account.findUniqueOrThrow({
        where: { id: accountId },
        select: {
          mfaEnabledAt: true,
          mfaPendingExpiresAt: true,
          mfaLockedUntil: true,
        },
      }),
      this.prisma.refreshSession.findFirst({
        where: { accountId, familyId, revokedAt: null },
        select: { mfaAuthenticatedAt: true },
      }),
      this.prisma.mfaRecoveryCode.count({ where: { accountId, usedAt: null } }),
      this.prisma.accountSystemRole.findMany({
        where: { accountId },
        select: { role: true },
      }),
    ]);
    return {
      enabledAt: account.mfaEnabledAt,
      recoveryCodesRemaining: recoveryCodes,
      recentUntil: family?.mfaAuthenticatedAt
        ? new Date(family.mfaAuthenticatedAt.getTime() + MFA_RECENCY_MS)
        : null,
      lockedUntil:
        account.mfaLockedUntil && account.mfaLockedUntil > new Date()
          ? account.mfaLockedUntil
          : null,
      pendingSetup: Boolean(
        account.mfaPendingExpiresAt && account.mfaPendingExpiresAt > new Date(),
      ),
      requiredForPrivilegedActions:
        this.config.get<string>('NODE_ENV') === 'production' &&
        roles.some(({ role }) =>
          ['REVIEWER', 'OPERATIONS_ADMIN', 'PLATFORM_ADMIN'].includes(role),
        ),
    };
  }

  async begin(
    accountId: string,
    familyId: string,
    password: string,
    correlationId: string,
  ) {
    const initial = await this.reauthenticate(accountId, password);
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const totp = this.totp(secret, initial.email);
    const uri = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(uri, {
      errorCorrectionLevel: 'M',
      width: 240,
      margin: 2,
    });
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, accountId);
      await this.requireFamily(tx, accountId, familyId);
      this.requireUnchangedPassword(account, initial);
      if (account.mfaEnabledAt)
        throw new ConflictException('Two-step verification is already enabled');
      await tx.account.update({
        where: { id: accountId },
        data: {
          mfaPendingSecretEncrypted: this.encryption.encrypt(
            secret,
            ENCRYPTION_CONTEXT,
          ),
          mfaPendingExpiresAt: expiresAt,
        },
      });
      await this.record(tx, accountId, 'setup_started', correlationId);
    });
    return {
      secret,
      qrDataUrl,
      expiresAt,
      issuer: 'VetLinX',
      accountLabel: initial.email,
    };
  }

  async confirm(
    accountId: string,
    familyId: string,
    code: string,
    correlationId: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, accountId);
      await this.requireFamily(tx, accountId, familyId);
      if (account.mfaEnabledAt)
        throw new ConflictException('Two-step verification is already enabled');
      if (
        !account.mfaPendingSecretEncrypted ||
        !account.mfaPendingExpiresAt ||
        account.mfaPendingExpiresAt <= new Date()
      )
        throw new BadRequestException(
          'Setup expired. Start again with your password.',
        );
      if (this.isLocked(account)) return null;
      const secret = this.encryption.decrypt(
        account.mfaPendingSecretEncrypted,
        ENCRYPTION_CONTEXT,
      );
      const step = this.validStep(secret, code, null);
      if (step === null) {
        await this.failedProof(tx, account);
        return null;
      }
      const now = new Date();
      await tx.account.update({
        where: { id: accountId },
        data: {
          mfaSecretEncrypted: account.mfaPendingSecretEncrypted,
          mfaEnabledAt: now,
          mfaPendingSecretEncrypted: null,
          mfaPendingExpiresAt: null,
          mfaLastUsedStep: BigInt(step),
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
        },
      });
      await tx.refreshSession.updateMany({
        where: { accountId, familyId, revokedAt: null },
        data: { mfaAuthenticatedAt: now },
      });
      await tx.refreshSession.updateMany({
        where: { accountId, familyId: { not: familyId }, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.mfaChallenge.updateMany({
        where: { accountId, usedAt: null },
        data: { usedAt: now },
      });
      const recoveryCodes = await this.newRecoveryCodes(tx, accountId);
      await this.record(tx, accountId, 'enabled', correlationId);
      await this.securityEmail(
        tx,
        account.email,
        `mfa-enabled:${accountId}:${now.getTime()}`,
        'Two-step verification is enabled',
        'Two-step verification was enabled for your VetLinX account. Keep your recovery codes private and safe.',
      );
      return {
        recoveryCodes,
        message:
          'Two-step verification is enabled. Save these recovery codes now; they will not be shown again.',
      };
    });
    if (!result) throw new ForbiddenException(INVALID_CODE);
    return result;
  }

  async stepUp(
    accountId: string,
    familyId: string,
    code: string,
    correlationId: string,
  ) {
    const valid = await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, accountId);
      await this.requireFamily(tx, accountId, familyId);
      if (!(await this.consumeProof(tx, account, code))) return false;
      const updated = await tx.refreshSession.updateMany({
        where: {
          accountId,
          familyId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { mfaAuthenticatedAt: new Date() },
      });
      if (!updated.count) throw new UnauthorizedException();
      await this.record(tx, accountId, 'step_up', correlationId);
      return true;
    });
    if (!valid) throw new ForbiddenException(INVALID_CODE);
    return { message: 'Identity confirmed for the next 15 minutes.' };
  }

  async regenerateRecoveryCodes(
    accountId: string,
    familyId: string,
    code: string,
    password: string,
    correlationId: string,
  ) {
    const initial = await this.reauthenticate(accountId, password);
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, accountId);
      await this.requireFamily(tx, accountId, familyId);
      this.requireUnchangedPassword(account, initial);
      if (!(await this.consumeProof(tx, account, code))) return null;
      const recoveryCodes = await this.newRecoveryCodes(tx, accountId);
      await this.record(
        tx,
        accountId,
        'recovery_codes_regenerated',
        correlationId,
      );
      return {
        recoveryCodes,
        message:
          'Save your new recovery codes. All previous recovery codes are invalid.',
      };
    });
    if (!result) throw new ForbiddenException(INVALID_CODE);
    return result;
  }

  async disable(
    accountId: string,
    familyId: string,
    code: string,
    password: string,
    correlationId: string,
  ) {
    const initial = await this.reauthenticate(accountId, password);
    const valid = await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, accountId);
      await this.requireFamily(tx, accountId, familyId);
      this.requireUnchangedPassword(account, initial);
      if (!(await this.consumeProof(tx, account, code))) return false;
      const now = new Date();
      await tx.account.update({
        where: { id: accountId },
        data: {
          mfaSecretEncrypted: null,
          mfaEnabledAt: null,
          mfaPendingSecretEncrypted: null,
          mfaPendingExpiresAt: null,
          mfaLastUsedStep: null,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
          authVersion: { increment: 1 },
        },
      });
      await tx.refreshSession.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.mfaChallenge.updateMany({
        where: { accountId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { accountId } });
      await this.record(tx, accountId, 'disabled', correlationId);
      await this.securityEmail(
        tx,
        account.email,
        `mfa-disabled:${accountId}:${now.getTime()}`,
        'Two-step verification is disabled',
        'Two-step verification was disabled for your VetLinX account and all devices were signed out. If you did not make this change, contact support and secure your account.',
      );
      return true;
    });
    if (!valid) throw new ForbiddenException(INVALID_CODE);
    return {
      message: 'Two-step verification is disabled. Sign in again to continue.',
      signedOutCurrent: true,
    };
  }

  async createLoginChallenge(
    tx: Prisma.TransactionClient,
    account: Account,
    metadata: RequestMetadata,
  ) {
    if (this.isLocked(account))
      throw new UnauthorizedException(
        'Two-step verification is temporarily locked. Try again in a few minutes.',
      );
    const challengeToken = randomBytes(48).toString('hex');
    await tx.mfaChallenge.create({
      data: {
        accountId: account.id,
        tokenHash: this.hash(challengeToken),
        authVersion: account.authVersion,
        expiresAt: new Date(Date.now() + 5 * 60_000),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    return { mfaRequired: true as const, challengeToken, expiresIn: 300 };
  }

  async consumeLoginChallenge(
    tx: Prisma.TransactionClient,
    challengeToken: string,
    code: string,
  ) {
    const found = await tx.mfaChallenge.findUnique({
      where: { tokenHash: this.hash(challengeToken) },
      select: { accountId: true, id: true },
    });
    if (!found) return null;
    const account = await this.lockAccount(tx, found.accountId);
    const challenge = await tx.mfaChallenge.findUnique({
      where: { id: found.id },
    });
    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt <= new Date() ||
      challenge.attempts >= 5 ||
      challenge.authVersion !== account.authVersion ||
      !account.mfaEnabledAt
    )
      return null;
    if (!(await this.consumeProof(tx, account, code))) {
      await tx.mfaChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: { increment: 1 },
          ...(challenge.attempts >= 4 ? { usedAt: new Date() } : {}),
        },
      });
      return null;
    }
    const used = await tx.mfaChallenge.updateMany({
      where: { id: challenge.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return used.count === 1 ? account : null;
  }

  private async consumeProof(
    tx: Prisma.TransactionClient,
    account: Account,
    code: string,
  ) {
    if (
      !account.mfaEnabledAt ||
      !account.mfaSecretEncrypted ||
      this.isLocked(account)
    )
      return false;
    const normalized = code.trim().replace(/[-\s]/g, '').toLowerCase();
    if (/^[a-f0-9]{32}$/.test(normalized)) {
      const used = await tx.mfaRecoveryCode.updateMany({
        where: {
          accountId: account.id,
          codeHash: this.hash(`${account.id}:${normalized}`),
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      if (used.count === 1) {
        await tx.account.update({
          where: { id: account.id },
          data: { mfaFailedAttempts: 0, mfaLockedUntil: null },
        });
        return true;
      }
    } else {
      const secret = this.encryption.decrypt(
        account.mfaSecretEncrypted,
        ENCRYPTION_CONTEXT,
      );
      const step = this.validStep(secret, normalized, account.mfaLastUsedStep);
      if (step !== null) {
        await tx.account.update({
          where: { id: account.id },
          data: {
            mfaLastUsedStep: BigInt(step),
            mfaFailedAttempts: 0,
            mfaLockedUntil: null,
          },
        });
        return true;
      }
    }
    await this.failedProof(tx, account);
    return false;
  }

  private validStep(secret: string, code: string, previous: bigint | null) {
    if (!/^\d{6}$/.test(code)) return null;
    const totp = this.totp(secret);
    const timestamp = Date.now();
    const delta = totp.validate({ token: code, window: 1, timestamp });
    if (delta === null) return null;
    const step = totp.counter({ timestamp }) + delta;
    return previous !== null && BigInt(step) <= previous ? null : step;
  }

  private isLocked(account: Account) {
    return Boolean(
      account.mfaLockedUntil && account.mfaLockedUntil > new Date(),
    );
  }
  private async failedProof(tx: Prisma.TransactionClient, account: Account) {
    const attempts =
      account.mfaLockedUntil && account.mfaLockedUntil <= new Date()
        ? 1
        : account.mfaFailedAttempts + 1;
    await tx.account.update({
      where: { id: account.id },
      data: {
        mfaFailedAttempts: attempts,
        ...(attempts >= 5
          ? { mfaLockedUntil: new Date(Date.now() + 5 * 60_000) }
          : {}),
      },
    });
  }
  private totp(secret: string, label = '') {
    return new OTPAuth.TOTP({
      issuer: 'VetLinX',
      label,
      secret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
  }
  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  private async lockAccount(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM identity.accounts WHERE id = ${id}::uuid FOR UPDATE`;
    const account = await tx.account.findUnique({ where: { id } });
    if (!account || account.status !== 'ACTIVE')
      throw new UnauthorizedException();
    return account;
  }
  private async requireFamily(
    tx: Prisma.TransactionClient,
    accountId: string,
    familyId: string,
  ) {
    const family = await tx.refreshSession.findFirst({
      where: {
        accountId,
        familyId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!family) throw new UnauthorizedException();
  }
  private async reauthenticate(accountId: string, password: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });
    if (
      !account ||
      account.status !== 'ACTIVE' ||
      !(await this.passwords.verify(account.passwordHash, password))
    )
      throw new BadRequestException('Your current password is incorrect.');
    return account;
  }
  private requireUnchangedPassword(current: Account, previous: Account) {
    if (
      current.passwordHash !== previous.passwordHash ||
      current.authVersion !== previous.authVersion
    )
      throw new BadRequestException(
        'Your account changed. Sign in and try again.',
      );
  }
  private async newRecoveryCodes(
    tx: Prisma.TransactionClient,
    accountId: string,
  ) {
    const codes = Array.from({ length: 10 }, () =>
      randomBytes(16)
        .toString('hex')
        .match(/.{1,8}/g)!
        .join('-'),
    );
    await tx.mfaRecoveryCode.deleteMany({ where: { accountId } });
    await tx.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({
        accountId,
        codeHash: this.hash(`${accountId}:${code.replace(/-/g, '')}`),
      })),
    });
    return codes;
  }
  private async record(
    tx: Prisma.TransactionClient,
    accountId: string,
    event: string,
    correlationId: string,
  ) {
    const now = new Date();
    await this.audit.recordInTransaction(tx, {
      actorId: accountId,
      action: `identity.mfa.${event}`,
      resourceType: 'account',
      resourceId: accountId,
      occurredAt: now.toISOString(),
      correlationId,
    });
    await this.outbox.enqueue(tx, [
      {
        id: randomUUID(),
        name: 'MfaSecurityChanged',
        version: 1,
        aggregateId: accountId,
        occurredAt: now.toISOString(),
        correlationId,
        payload: { accountId, action: event },
      },
    ]);
  }
  private securityEmail(
    tx: Prisma.TransactionClient,
    to: string,
    idempotencyKey: string,
    subject: string,
    text: string,
  ) {
    return this.encryption.enqueue(tx, {
      to,
      idempotencyKey,
      subject,
      text,
      sensitive: false,
      expiresAt: new Date(Date.now() + 86400000),
    });
  }
}
