import {
  type INestApplication,
  Logger,
  ServiceUnavailableException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthTokenService } from '../src/modules/identity/auth-token.service';
import { IdentitySecurityService } from '../src/modules/identity-security/identity-security.service';
import {
  NOTIFICATIONS_PUBLIC_API,
  type NotificationsPublicApi,
} from '../src/modules/notifications/notifications.public';
import { PrismaService } from '../src/platform/persistence/prisma.service';

function stringField(body: unknown, key: string): string {
  if (!body || typeof body !== 'object')
    throw new Error('Missing response body');
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== 'string')
    throw new Error(`Missing response field ${key}`);
  return value;
}

describe('Identity recovery, email verification and session security', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const accounts: string[] = [];
  const emails: Parameters<NotificationsPublicApi['enqueueEmail']>[1][] = [];
  const fixtureEmail = `security-${randomUUID()}@identity-security.test`;
  const strangerEmail = `stranger-${randomUUID()}@identity-security.test`;
  let rejectNextDelivery = false;
  const originalPassword = 'Original-Identity-Security-Password-2026';
  const newPassword = 'Updated-Identity-Security-Password-2026';
  let accountId: string;
  let token: string;
  let oldRefresh: string;
  let activeRefresh: string;
  let strangerToken: string;
  let strangerFamily: string;
  let resetToken: string;
  let verificationToken: string;
  const http = () => app.getHttpServer() as Parameters<typeof request>[0];
  const bearer = () => `Bearer ${token}`;

  it('disables recovery and verification without issuing tokens or claiming email was sent', async () => {
    const config = app.get(ConfigService);
    const previous = config.get<string>('MAIL_TRANSPORT', 'capture');
    const tokenCount = await prisma.securityToken.count();
    const mailCount = emails.length;
    config.set('MAIL_TRANSPORT', 'disabled');
    try {
      const responses = [];
      const recovery = app.get(IdentitySecurityService);
      for (const email of [
        fixtureEmail,
        `missing-${randomUUID()}@identity-security.test`,
      ]) {
        const response = await recovery
          .requestPasswordReset(email, randomUUID())
          .catch((error: unknown) => {
            if (!(error instanceof ServiceUnavailableException)) throw error;
            expect(error.getStatus()).toBe(503);
            return error.getResponse();
          });
        responses.push(response);
      }
      expect(responses[0]).toEqual(responses[1]);
      const verification = await request(http())
        .post('/api/v1/auth/email-verification/request')
        .set('authorization', bearer())
        .expect(503);
      expect(verification.body as unknown).toMatchObject({
        message: expect.stringContaining('disabled') as unknown,
      });
      const status = await request(http())
        .get('/api/v1/auth/security')
        .set('authorization', bearer())
        .expect(200);
      expect(status.body as unknown).toMatchObject({
        emailDeliveryEnabled: false,
        emailVerifiedAt: null,
      });
      expect(await prisma.securityToken.count()).toBe(tokenCount);
      expect(emails.length).toBe(mailCount);
    } finally {
      config.set('MAIL_TRANSPORT', previous);
    }
  });

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATIONS_PUBLIC_API)
      .useValue({
        enqueue: () => Promise.resolve(),
        enqueueEmail: (
          _tx: unknown,
          message: Parameters<NotificationsPublicApi['enqueueEmail']>[1],
        ) => {
          if (rejectNextDelivery) {
            rejectNextDelivery = false;
            return Promise.reject(
              new Error('Deliberate queue failure with private diagnostics'),
            );
          }
          emails.push(message);
          return Promise.resolve();
        },
      })
      .compile();
    app = fixture.createNestApplication();
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
    const owner = await request(http())
      .post('/api/v1/auth/register')
      .send({ email: fixtureEmail, password: originalPassword })
      .expect(201);
    token = stringField(owner.body as unknown, 'accessToken');
    oldRefresh = stringField(owner.body as unknown, 'refreshToken');
    const me = await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', bearer())
      .expect(200);
    accountId = stringField(me.body as unknown, 'accountId');
    accounts.push(accountId);
    const stranger = await request(http())
      .post('/api/v1/auth/register')
      .send({
        email: strangerEmail,
        password: originalPassword,
      })
      .expect(201);
    strangerToken = stringField(stranger.body as unknown, 'accessToken');
    const strangerMe = await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${strangerToken}`)
      .expect(200);
    const strangerId = stringField(strangerMe.body as unknown, 'accountId');
    accounts.push(strangerId);
    const family = await prisma.refreshSession.findFirstOrThrow({
      where: { accountId: strangerId },
      select: { familyId: true },
    });
    strangerFamily = family.familyId;
  });

  function emailedToken(subject: string) {
    const email = emails.find(
      (item) => item.subject === subject && item.to === fixtureEmail,
    );
    if (!email) throw new Error('Expected security email was not queued');
    const link = email.text.split('\n').find((line) => line.startsWith('http'));
    if (!link) throw new Error('Expected security link was not queued');
    const url = new URL(link);
    expect(url.searchParams.has('token')).toBe(false);
    const raw = new URLSearchParams(url.hash.slice(1)).get('token');
    if (!raw) throw new Error('Expected security token was not queued');
    expect(email.sensitive).toBe(true);
    expect(email.expiresAt).toBeInstanceOf(Date);
    return raw;
  }

  it('requires authentication for security data, session data and verification requests', async () => {
    await request(http()).get('/api/v1/auth/security').expect(401);
    await request(http()).get('/api/v1/auth/sessions').expect(401);
    await request(http())
      .post('/api/v1/auth/email-verification/request')
      .expect(401);
    const tokens = app.get(AuthTokenService);
    for (const sessionFamilyId of [undefined, 'malformed-family']) {
      const unbound = await tokens.signAccessToken({
        accountId,
        email: fixtureEmail,
        authVersion: 0,
        sessionFamilyId,
      });
      await request(http())
        .get('/api/v1/auth/me')
        .set('authorization', `Bearer ${unbound}`)
        .expect(401);
    }
  });

  it('uses identical reset responses for known and unknown emails and stores only a token hash', async () => {
    const known = await request(http())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: fixtureEmail.toUpperCase() })
      .expect(200);
    const unknown = await request(http())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: `missing-${randomUUID()}@identity-security.test` })
      .expect(200);
    expect(known.body as unknown).toEqual(unknown.body as unknown);
    resetToken = emailedToken('Reset your VetLinX password');
    expect(JSON.stringify(known.body)).not.toContain(resetToken);
    const stored = await prisma.securityToken.findFirstOrThrow({
      where: { accountId, purpose: 'PASSWORD_RESET' },
    });
    expect(stored.tokenHash).toBe(
      createHash('sha256').update(resetToken).digest('hex'),
    );
    expect(JSON.stringify(stored)).not.toContain(resetToken);
    const count = emails.length;
    await request(http())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: fixtureEmail })
      .expect(200);
    expect(emails).toHaveLength(count);
  });

  it('separates verification from password reset, consumes verification once, and sends no new email after verification', async () => {
    await request(http())
      .post('/api/v1/auth/email-verification/request')
      .set('authorization', bearer())
      .expect(200);
    verificationToken = emailedToken('Verify your VetLinX email');
    await request(http())
      .post('/api/v1/auth/password-reset/complete')
      .send({ token: verificationToken, password: newPassword })
      .expect(400);
    await request(http())
      .post('/api/v1/auth/email-verification/complete')
      .send({ token: verificationToken })
      .expect(200);
    await request(http())
      .post('/api/v1/auth/email-verification/complete')
      .send({ token: verificationToken })
      .expect(400);
    const status = await request(http())
      .get('/api/v1/auth/security')
      .set('authorization', bearer())
      .expect(200);
    expect(stringField(status.body as unknown, 'email')).toBe(fixtureEmail);
    expect(
      new Date(
        stringField(status.body as unknown, 'emailVerifiedAt'),
      ).getTime(),
    ).not.toBeNaN();
    const count = emails.length;
    await request(http())
      .post('/api/v1/auth/email-verification/request')
      .set('authorization', bearer())
      .expect(200);
    expect(emails).toHaveLength(count);
  });

  it('keeps delivery failures indistinguishable and rolls back undeliverable reset tokens', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    rejectNextDelivery = true;
    try {
      const startedAt = performance.now();
      const failed = await request(http())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: strangerEmail })
        .expect(200);
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(230);
      const unknown = await request(http())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: `missing-${randomUUID()}@identity-security.test` })
        .expect(200);
      expect(failed.body as unknown).toEqual(unknown.body as unknown);
      const stranger = await prisma.account.findUniqueOrThrow({
        where: { email: strangerEmail },
        select: { id: true },
      });
      expect(
        await prisma.securityToken.count({ where: { accountId: stranger.id } }),
      ).toBe(0);
      expect(log).toHaveBeenCalledWith('IDENTITY_RECOVERY_ENQUEUE_FAILED');
      expect(JSON.stringify(log.mock.calls)).not.toContain(strangerEmail);
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        'private diagnostics',
      );
    } finally {
      log.mockRestore();
    }
  });

  it('consumes a reset once under concurrency and invalidates both old access and refresh tokens', async () => {
    const results = await Promise.all([
      request(http())
        .post('/api/v1/auth/password-reset/complete')
        .send({ token: resetToken, password: newPassword }),
      request(http())
        .post('/api/v1/auth/password-reset/complete')
        .send({ token: resetToken, password: newPassword }),
    ]);
    expect(results.map((item) => item.status).sort()).toEqual([200, 400]);
    await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', bearer())
      .expect(401);
    await request(http())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefresh })
      .expect(401);
    await request(http())
      .post('/api/v1/auth/login')
      .send({ email: fixtureEmail, password: originalPassword })
      .expect(401);
    const updated = await request(http())
      .post('/api/v1/auth/login')
      .send({ email: fixtureEmail, password: newPassword })
      .expect(200);
    token = stringField(updated.body as unknown, 'accessToken');
    activeRefresh = stringField(updated.body as unknown, 'refreshToken');
    const changes = await prisma.auditEvent.findMany({
      where: { resourceId: accountId, action: 'identity.password.reset' },
    });
    expect(changes).toHaveLength(1);
    const events = await prisma.outboxEvent.findMany({
      where: { aggregateId: accountId, name: 'AccountPasswordReset' },
    });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(changes)).not.toContain(resetToken);
    expect(JSON.stringify(events)).not.toContain(resetToken);
  });

  it('rejects expired links and links for suspended accounts without mutating password or email', async () => {
    const expired = randomBytes(48).toString('hex');
    await prisma.securityToken.create({
      data: {
        accountId,
        purpose: 'PASSWORD_RESET',
        tokenHash: createHash('sha256').update(expired).digest('hex'),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const before = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { passwordHash: true, emailVerifiedAt: true, authVersion: true },
    });
    await request(http())
      .post('/api/v1/auth/password-reset/complete')
      .send({ token: expired, password: originalPassword })
      .expect(400);
    const blocked = randomBytes(48).toString('hex');
    await prisma.securityToken.create({
      data: {
        accountId,
        purpose: 'EMAIL_VERIFY',
        tokenHash: createHash('sha256').update(blocked).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.account.update({
      where: { id: accountId },
      data: { status: 'SUSPENDED' },
    });
    await request(http())
      .post('/api/v1/auth/email-verification/complete')
      .send({ token: blocked })
      .expect(400);
    await prisma.account.update({
      where: { id: accountId },
      data: { status: 'ACTIVE' },
    });
    const after = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { passwordHash: true, emailVerifiedAt: true, authVersion: true },
    });
    expect(after).toEqual(before);
  });

  it('returns redacted session families and cannot revoke another account’s session', async () => {
    const devices = await request(http())
      .get('/api/v1/auth/sessions')
      .set('authorization', bearer())
      .expect(200);
    expect(Array.isArray(devices.body as unknown)).toBe(true);
    const deviceList = devices.body as { id: string; current: boolean }[];
    expect(
      deviceList.some(
        (device) => device.current && typeof device.id === 'string',
      ),
    ).toBe(true);
    expect(JSON.stringify(devices.body)).not.toContain('tokenHash');
    expect(JSON.stringify(devices.body)).not.toContain('accountId');
    await request(http())
      .delete(`/api/v1/auth/sessions/${strangerFamily}`)
      .set('authorization', bearer())
      .expect(404);
    await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${strangerToken}`)
      .expect(200);
  });

  it('revokes one device family while another active device can refresh', async () => {
    const device = await request(http())
      .post('/api/v1/auth/login')
      .set('user-agent', 'Security integration second device')
      .send({ email: fixtureEmail, password: newPassword })
      .expect(200);
    const secondToken = stringField(device.body as unknown, 'accessToken');
    const secondRefresh = stringField(device.body as unknown, 'refreshToken');
    const family = await prisma.refreshSession.findUniqueOrThrow({
      where: {
        tokenHash: createHash('sha256').update(secondRefresh).digest('hex'),
      },
      select: { familyId: true },
    });
    await request(http())
      .delete(`/api/v1/auth/sessions/${family.familyId}`)
      .set('authorization', bearer())
      .expect(200);
    await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${secondToken}`)
      .expect(401);
    await request(http())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: secondRefresh })
      .expect(401);
    // A device-bound revocation leaves other devices' access and refresh credentials valid.
    await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', bearer())
      .expect(200);
    const current = await prisma.refreshSession.findFirstOrThrow({
      where: { accountId, revokedAt: null },
      select: { id: true },
    });
    expect(current.id).toBeDefined();
    const renewed = await request(http())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: activeRefresh })
      .expect(200);
    token = stringField(renewed.body as unknown, 'accessToken');
    activeRefresh = stringField(renewed.body as unknown, 'refreshToken');
  });

  it('logs out a rotated device family using its ancestor token without signing out another device', async () => {
    const device = await request(http())
      .post('/api/v1/auth/login')
      .send({ email: fixtureEmail, password: newPassword })
      .expect(200);
    const ancestorToken = stringField(device.body as unknown, 'accessToken');
    const ancestorRefresh = stringField(device.body as unknown, 'refreshToken');
    const rotated = await request(http())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ancestorRefresh })
      .expect(200);
    const replacementToken = stringField(
      rotated.body as unknown,
      'accessToken',
    );
    const replacementRefresh = stringField(
      rotated.body as unknown,
      'refreshToken',
    );
    await request(http())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: ancestorRefresh })
      .expect(204);
    for (const revokedToken of [ancestorToken, replacementToken]) {
      await request(http())
        .get('/api/v1/auth/me')
        .set('authorization', `Bearer ${revokedToken}`)
        .expect(401);
    }
    await request(http())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: replacementRefresh })
      .expect(401);
    await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', bearer())
      .expect(200);
  });

  it('signs out every device and immediately rejects preexisting access tokens', async () => {
    await request(http())
      .post('/api/v1/auth/sessions/revoke-all')
      .set('authorization', bearer())
      .expect(200);
    await request(http())
      .get('/api/v1/auth/me')
      .set('authorization', bearer())
      .expect(401);
    expect(
      await prisma.refreshSession.count({
        where: { accountId, revokedAt: null },
      }),
    ).toBe(0);
  });

  afterAll(async () => {
    if (prisma && accounts.length) {
      await prisma.securityToken.deleteMany({
        where: { accountId: { in: accounts } },
      });
      await prisma.refreshSession.deleteMany({
        where: { accountId: { in: accounts } },
      });
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: accounts } },
      });
      await prisma.auditEvent.deleteMany({
        where: { actorId: { in: accounts } },
      });
      await prisma.account.deleteMany({ where: { id: { in: accounts } } });
    }
    await app?.close();
  });
});
