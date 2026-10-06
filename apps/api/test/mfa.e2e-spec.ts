import {
  type INestApplication,
  UnauthorizedException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/persistence/prisma.service';
import { MailQueueService } from '../src/platform/delivery/mail-queue.service';
import { MfaService } from '../src/modules/identity-security/mfa.service';
import {
  IDENTITY_PUBLIC_API,
  type IdentityPublicApi,
} from '../src/modules/identity/identity.public';
import {
  NOTIFICATIONS_PUBLIC_API,
  type NotificationsPublicApi,
} from '../src/modules/notifications/notifications.public';

function field(body: unknown, key: string): string {
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== 'string') throw new Error(`Missing ${key}`);
  return value;
}
function codes(body: unknown): string[] {
  const value = (body as Record<string, unknown>).recoveryCodes;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
    throw new Error('Missing recovery codes');
  return value;
}
describe('Authenticator MFA, recovery and privileged step-up', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mfa: MfaService;
  let accountId: string;
  let strangerId: string;
  let token: string;
  let refresh: string;
  let secondToken: string;
  let secondRefresh: string;
  let strangerToken: string;
  let familyId: string;
  let secret: string;
  let recovery: string[];
  let resetChallenge: string;
  const password = 'Mfa-Original-Password-2026';
  const nextPassword = 'Mfa-Updated-Password-2026';
  const email = `mfa-${randomUUID()}@identity-mfa.test`;
  const strangerEmail = `mfa-other-${randomUUID()}@identity-mfa.test`;
  const deliveries: Parameters<NotificationsPublicApi['enqueueEmail']>[1][] =
    [];
  const hash = (text: string) =>
    createHash('sha256').update(text).digest('hex');
  const otp = (offset = 0) =>
    new OTPAuth.TOTP({
      secret,
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    }).generate({ timestamp: Date.now() + offset });
  const http = () => app.getHttpServer() as Parameters<typeof request>[0];
  const auth = () => `Bearer ${token}`;
  const post = (path: string, data: object) =>
    request(http())
      .post(`/api/v1/auth/mfa/${path}`)
      .set('authorization', auth())
      .send(data);
  const login = (pwd = password) =>
    request(http()).post('/api/v1/auth/login').send({ email, password: pwd });
  const finish = (challengeToken: string, code: string) =>
    request(http())
      .post('/api/v1/auth/mfa/login')
      .send({ challengeToken, code });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATIONS_PUBLIC_API)
      .useValue({
        enqueue: () => Promise.resolve(),
        enqueueEmail: (
          _tx: unknown,
          message: Parameters<NotificationsPublicApi['enqueueEmail']>[1],
        ) => {
          deliveries.push(message);
          return Promise.resolve();
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    mfa = app.get(MfaService);
    const registered = await request(http())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(201);
    token = field(registered.body, 'accessToken');
    refresh = field(registered.body, 'refreshToken');
    accountId = field(
      (
        await request(http())
          .get('/api/v1/auth/me')
          .set('authorization', auth())
          .expect(200)
      ).body,
      'accountId',
    );
    const other = await login().expect(200);
    secondToken = field(other.body, 'accessToken');
    secondRefresh = field(other.body, 'refreshToken');
    const stranger = await request(http())
      .post('/api/v1/auth/register')
      .send({ email: strangerEmail, password })
      .expect(201);
    strangerToken = field(stranger.body, 'accessToken');
    strangerId = field(
      (
        await request(http())
          .get('/api/v1/auth/me')
          .set('authorization', `Bearer ${strangerToken}`)
          .expect(200)
      ).body,
      'accountId',
    );
    familyId = (
      await prisma.refreshSession.findUniqueOrThrow({
        where: { tokenHash: hash(refresh) },
      })
    ).familyId;
  });

  it('requires password reauthentication and encrypts pending secrets with a distinct purpose', async () => {
    await request(http())
      .post('/api/v1/auth/mfa/setup')
      .send({ password })
      .expect(401);
    await post('setup', { password: 'incorrect' }).expect(400);
    const result = await post('setup', { password }).expect(200);
    secret = field(result.body, 'secret');
    expect(
      field(result.body, 'qrDataUrl').startsWith('data:image/png;base64,'),
    ).toBe(true);
    const pending = (
      await prisma.account.findUniqueOrThrow({ where: { id: accountId } })
    ).mfaPendingSecretEncrypted!;
    expect(pending.includes(secret)).toBe(false);
    expect(
      app.get(MailQueueService).decrypt(pending, 'identity-mfa-secret') ===
        secret,
    ).toBe(true);
    expect(() => app.get(MailQueueService).decrypt(pending)).toThrow();
    const status = await request(http())
      .get('/api/v1/auth/mfa')
      .set('authorization', auth())
      .expect(200);
    expect(
      Object.keys(status.body as object).some((key) =>
        /secret|hash/i.test(key),
      ),
    ).toBe(false);
  });

  it('confirms once, hashes recovery codes and revokes pre-MFA device families', async () => {
    await post('confirm', { code: 'invalid' }).expect(403);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: accountId } }))
        .mfaFailedAttempts,
    ).toBe(1);
    recovery = codes((await post('confirm', { code: otp() }).expect(200)).body);
    expect(recovery.length).toBe(10);
    const stored = await prisma.mfaRecoveryCode.findMany({
      where: { accountId },
    });
    expect(
      stored.every((row) =>
        recovery.every((code) => !row.codeHash.includes(code)),
      ),
    ).toBe(true);
    expect(new Set(stored.map((row) => row.codeHash)).size).toBe(10);
    await post('confirm', { code: otp() }).expect(409);
    await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${secondToken}`)
      .expect(401);
    await request(http())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: secondRefresh })
      .expect(401);
    await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', auth())
      .expect(200);
  });

  it('issues no session before a password challenge completes and consumes concurrent proofs once', async () => {
    const before = await prisma.refreshSession.count({ where: { accountId } });
    const challenge = await login().expect(200);
    const challengeToken = field(challenge.body, 'challengeToken');
    expect(Object.hasOwn(challenge.body as object, 'accessToken')).toBe(false);
    expect(Object.hasOwn(challenge.body as object, 'refreshToken')).toBe(false);
    expect(await prisma.refreshSession.count({ where: { accountId } })).toBe(
      before,
    );
    expect(
      await prisma.mfaChallenge.count({
        where: { accountId, tokenHash: hash(challengeToken) },
      }),
    ).toBe(1);
    const results = await Promise.all([
      finish(challengeToken, recovery[0]),
      finish(challengeToken, recovery[0]),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    expect(await prisma.refreshSession.count({ where: { accountId } })).toBe(
      before + 1,
    );
    const signedIn = results.find((result) => result.status === 200)!;
    token = field(signedIn.body, 'accessToken');
    refresh = field(signedIn.body, 'refreshToken');
    familyId = (
      await prisma.refreshSession.findUniqueOrThrow({
        where: { tokenHash: hash(refresh) },
      })
    ).familyId;
    await post('step-up', { code: recovery[0] }).expect(403);
    await post('step-up', { code: otp(-30_000) }).expect(403);
    await post('step-up', { code: otp(30_000) }).expect(200);
    await post('step-up', { code: otp(30_000) }).expect(403);
  });

  it('consumes a recovery code once across independently authenticated challenges', async () => {
    const first = field((await login().expect(200)).body, 'challengeToken');
    const second = field((await login().expect(200)).body, 'challengeToken');
    const results = await Promise.all([
      finish(first, recovery[9]),
      finish(second, recovery[9]),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
  });

  it('prunes old expired artifacts with a 24-hour grace without touching active MFA or audits', async () => {
    const now = new Date();
    const oldExpiry = new Date(now.getTime() - 25 * 60 * 60_000);
    const recentExpiry = new Date(now.getTime() - 60 * 60_000);
    const activeExpiry = new Date(now.getTime() + 60 * 60_000);
    const expiryCases = [oldExpiry, oldExpiry, recentExpiry, activeExpiry];
    const oldIds: string[] = [];
    const retainedIds: string[] = [];
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
    });
    for (const [index, expiresAt] of expiryCases.entries()) {
      const data = {
        accountId,
        tokenHash: hash(randomUUID()),
        expiresAt,
        usedAt: index === 0 ? now : null,
      };
      const link = await prisma.securityToken.create({
        data: {
          ...data,
          purpose: index % 2 ? 'EMAIL_VERIFY' : 'PASSWORD_RESET',
        },
      });
      const challenge = await prisma.mfaChallenge.create({
        data: {
          ...data,
          tokenHash: hash(randomUUID()),
          authVersion: account.authVersion,
        },
      });
      (index < 2 ? oldIds : retainedIds).push(link.id, challenge.id);
    }
    const codesBefore = await prisma.mfaRecoveryCode.count({
      where: { accountId, usedAt: null },
    });
    const sessionsBefore = await prisma.refreshSession.count({
      where: { accountId },
    });
    const auditsBefore = await prisma.auditEvent.count({
      where: { actorId: accountId },
    });
    const removed = await app
      .get<IdentityPublicApi>(IDENTITY_PUBLIC_API)
      .pruneExpiredSecurityArtifacts(now);
    expect(removed).toBeGreaterThanOrEqual(4);
    expect(removed).toBeLessThanOrEqual(2_000);
    expect(
      await prisma.securityToken.count({ where: { id: { in: oldIds } } }),
    ).toBe(0);
    expect(
      await prisma.mfaChallenge.count({ where: { id: { in: oldIds } } }),
    ).toBe(0);
    expect(
      await prisma.securityToken.count({ where: { id: { in: retainedIds } } }),
    ).toBe(2);
    expect(
      await prisma.mfaChallenge.count({ where: { id: { in: retainedIds } } }),
    ).toBe(2);
    const after = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
    });
    expect(Boolean(after.mfaEnabledAt)).toBe(true);
    expect(after.mfaSecretEncrypted === account.mfaSecretEncrypted).toBe(true);
    expect(
      await prisma.mfaRecoveryCode.count({
        where: { accountId, usedAt: null },
      }),
    ).toBe(codesBefore);
    expect(await prisma.refreshSession.count({ where: { accountId } })).toBe(
      sessionsBefore,
    );
    expect(
      await prisma.auditEvent.count({ where: { actorId: accountId } }),
    ).toBe(auditsBefore);
    // Remove only this retention test's retained fixtures so they do not trigger
    // the real account's request-link cooldown in the following recovery flow.
    await prisma.securityToken.deleteMany({
      where: { id: { in: retainedIds } },
    });
    await prisma.mfaChallenge.deleteMany({
      where: { id: { in: retainedIds } },
    });
  });

  it('expires challenges and locks attempts without rolling failed counters back', async () => {
    const expired = await login().expect(200);
    const expiredToken = field(expired.body, 'challengeToken');
    await prisma.mfaChallenge.update({
      where: { tokenHash: hash(expiredToken) },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await finish(expiredToken, recovery[1]).expect(401);
    await prisma.account.update({
      where: { id: accountId },
      data: { mfaFailedAttempts: 0, mfaLockedUntil: null },
    });
    const challengeToken = field(
      (await login().expect(200)).body,
      'challengeToken',
    );
    for (let attempt = 0; attempt < 5; attempt++)
      await finish(challengeToken, 'invalid').expect(401);
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
    });
    const challenge = await prisma.mfaChallenge.findUniqueOrThrow({
      where: { tokenHash: hash(challengeToken) },
    });
    expect(account.mfaFailedAttempts).toBe(5);
    expect(
      Boolean(account.mfaLockedUntil && account.mfaLockedUntil > new Date()),
    ).toBe(true);
    expect(challenge.attempts).toBe(5);
    expect(Boolean(challenge.usedAt)).toBe(true);
    await login().expect(401);
    await prisma.account.update({
      where: { id: accountId },
      data: { mfaLockedUntil: new Date(Date.now() - 1) },
    });
    await post('step-up', { code: recovery[1] }).expect(200);
  });

  it('enforces production privileged enrolment and recent proof without extending recency on refresh', async () => {
    await prisma.accountSystemRole.createMany({
      data: [
        { accountId, role: 'REVIEWER', grantedBy: 'mfa-test-fixture' },
        {
          accountId: strangerId,
          role: 'REVIEWER',
          grantedBy: 'mfa-test-fixture',
        },
      ],
    });
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    const spy = jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) =>
        key === 'NODE_ENV' ? 'production' : original(key),
      );
    try {
      const enrollment = await request(http())
        .get('/api/v1/verification-reviews')
        .set('authorization', `Bearer ${strangerToken}`)
        .expect(403);
      expect((enrollment.body as { code: string }).code).toBe(
        'MFA_ENROLLMENT_REQUIRED',
      );
      await request(http())
        .get('/api/v1/verification-reviews')
        .set('authorization', auth())
        .expect(200);
      await prisma.refreshSession.updateMany({
        where: { accountId, familyId },
        data: { mfaAuthenticatedAt: new Date(Date.now() - 16 * 60_000) },
      });
      const stale = await request(http())
        .get('/api/v1/verification-reviews')
        .set('authorization', auth())
        .expect(403);
      expect((stale.body as { code: string }).code).toBe(
        'MFA_STEP_UP_REQUIRED',
      );
      const renewed = await request(http())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refresh })
        .expect(200);
      token = field(renewed.body, 'accessToken');
      refresh = field(renewed.body, 'refreshToken');
      await request(http())
        .get('/api/v1/verification-reviews')
        .set('authorization', auth())
        .expect(403);
      await post('step-up', { code: recovery[2] }).expect(200);
      await request(http())
        .get('/api/v1/verification-reviews')
        .set('authorization', auth())
        .expect(200);
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps MFA enabled after password recovery and invalidates outstanding challenges', async () => {
    resetChallenge = field((await login().expect(200)).body, 'challengeToken');
    await request(http())
      .post('/api/v1/auth/password-reset/request')
      .send({ email })
      .expect(200);
    const message = deliveries.find(
      (delivery) => delivery.to === email && delivery.subject.includes('Reset'),
    )!;
    const link = message.text.match(/https?:\/\/[^\s]+/)?.[0];
    if (!link) throw new Error('Missing reset link');
    const resetToken = new URLSearchParams(new URL(link).hash.slice(1)).get(
      'token',
    );
    await request(http())
      .post('/api/v1/auth/password-reset/complete')
      .send({ token: resetToken, password: nextPassword })
      .expect(200);
    expect(
      Boolean(
        (await prisma.account.findUniqueOrThrow({ where: { id: accountId } }))
          .mfaEnabledAt,
      ),
    ).toBe(true);
    await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', auth())
      .expect(401);
    await finish(resetChallenge, recovery[3]).expect(401);
    const challengeToken = field(
      (await login(nextPassword).expect(200)).body,
      'challengeToken',
    );
    const result = await finish(challengeToken, recovery[3]).expect(200);
    token = field(result.body, 'accessToken');
    refresh = field(result.body, 'refreshToken');
    familyId = (
      await prisma.refreshSession.findUniqueOrThrow({
        where: { tokenHash: hash(refresh) },
      })
    ).familyId;
  });

  it('requires password and proof to replace recovery codes or disable and signs out every family', async () => {
    const oldHash = hash(`${accountId}:${recovery[4].replace(/-/g, '')}`);
    await post('recovery-codes', {
      password: 'incorrect',
      code: recovery[4],
    }).expect(400);
    expect(
      (
        await prisma.mfaRecoveryCode.findUniqueOrThrow({
          where: { codeHash: oldHash },
        })
      ).usedAt,
    ).toBeNull();
    recovery = codes(
      (
        await post('recovery-codes', {
          password: nextPassword,
          code: recovery[4],
        }).expect(200)
      ).body,
    );
    expect(
      await prisma.mfaRecoveryCode.count({ where: { codeHash: oldHash } }),
    ).toBe(0);
    await post('disable', { password: 'incorrect', code: recovery[0] }).expect(
      400,
    );
    await post('disable', { password: nextPassword, code: recovery[0] }).expect(
      200,
    );
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
    });
    expect(account.mfaSecretEncrypted).toBeNull();
    expect(account.mfaEnabledAt).toBeNull();
    expect(account.mfaLastUsedStep).toBeNull();
    expect(await prisma.mfaRecoveryCode.count({ where: { accountId } })).toBe(
      0,
    );
    await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', auth())
      .expect(401);
    const result = await login(nextPassword).expect(200);
    token = field(result.body, 'accessToken');
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    const spy = jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) =>
        key === 'NODE_ENV' ? 'production' : original(key),
      );
    try {
      await request(http())
        .get('/api/v1/verification-reviews')
        .set('authorization', auth())
        .expect(403);
    } finally {
      spy.mockRestore();
    }
  });

  it('cannot enable MFA after current-family revocation wins the account lock', async () => {
    const family = (
      await prisma.refreshSession.findFirstOrThrow({
        where: { accountId: strangerId, revokedAt: null },
      })
    ).familyId;
    const setup = await mfa.begin(strangerId, family, password, randomUUID());
    await prisma.refreshSession.updateMany({
      where: { accountId: strangerId },
      data: { revokedAt: new Date() },
    });
    const code = new OTPAuth.TOTP({ secret: setup.secret }).generate();
    await expect(
      mfa.confirm(strangerId, family, code, randomUUID()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: strangerId } }))
        .mfaEnabledAt,
    ).toBeNull();
    expect(
      await prisma.mfaRecoveryCode.count({ where: { accountId: strangerId } }),
    ).toBe(0);
  });

  afterAll(async () => {
    if (prisma) {
      const ids = [accountId, strangerId].filter(Boolean);
      await prisma.emailDelivery.deleteMany({
        where: { to: { in: [email, strangerEmail] } },
      });
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: ids } },
      });
      await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
      await prisma.account.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });
});
