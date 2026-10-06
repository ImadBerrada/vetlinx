import {
  type INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthTokenService } from '../src/modules/identity/auth-token.service';
import { PrismaService } from '../src/platform/persistence/prisma.service';

describe('Private account notification preferences', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const accounts: string[] = [];
  let token: string;
  let strangerToken: string;
  const defaults = {
    appointmentUpdatesEmail: true,
    appointmentRemindersEmail: true,
    credentialUpdatesEmail: true,
    version: 0,
  };
  const values = {
    appointmentUpdatesEmail: false,
    appointmentRemindersEmail: true,
    credentialUpdatesEmail: false,
  };
  const http = () => app.getHttpServer() as Parameters<typeof request>[0];
  const read = (access = token) =>
    request(http())
      .get('/api/v1/notifications/preferences')
      .set('authorization', `Bearer ${access}`);
  const save = (body: object) =>
    request(http())
      .patch('/api/v1/notifications/preferences')
      .set('authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
    const tokens = app.get(AuthTokenService);
    for (let index = 0; index < 2; index++) {
      const account = await prisma.account.create({
        data: {
          email: `${randomUUID()}@preferences.test`,
          passwordHash: 'no-login-fixture',
          status: 'ACTIVE',
        },
      });
      accounts.push(account.id);
      const refresh = tokens.generateRefreshToken();
      const familyId = randomUUID();
      await prisma.refreshSession.create({
        data: {
          accountId: account.id,
          familyId,
          tokenHash: refresh.hash,
          expiresAt: refresh.expiresAt,
        },
      });
      const access = await tokens.signAccessToken({
        accountId: account.id,
        email: account.email,
        sessionFamilyId: familyId,
      });
      if (index === 0) token = access;
      else strangerToken = access;
    }
  });
  beforeEach(async () => {
    await prisma.notificationPreference.deleteMany({
      where: { accountId: { in: accounts } },
    });
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.auditEvent.deleteMany({
        where: { actorId: { in: accounts } },
      });
      await prisma.account.deleteMany({ where: { id: { in: accounts } } });
    }
    await app?.close();
  });

  it('requires authentication and returns safe defaults without creating a row', async () => {
    await request(http()).get('/api/v1/notifications/preferences').expect(401);
    expect((await read().expect(200)).body).toEqual(defaults);
    expect(
      await prisma.notificationPreference.count({
        where: { accountId: accounts[0] },
      }),
    ).toBe(0);
  });

  it('saves only the current account and records the versioned change', async () => {
    expect(
      (await save({ ...values, expectedVersion: 0 }).expect(200)).body,
    ).toEqual({ ...values, version: 1 });
    expect((await read(strangerToken).expect(200)).body).toEqual(defaults);
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: {
        actorId: accounts[0],
        action: 'notification.preferences.updated',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(event.resourceId).toBe(accounts[0]);
    expect(event.changes).toEqual({
      from: defaults,
      to: { ...values, version: 1 },
    });
    await save({
      ...values,
      expectedVersion: 1,
      accountId: accounts[1],
    }).expect(400);
  });

  it('rejects malformed values and attempts to disable mandatory channels', async () => {
    for (const body of [
      { ...values, expectedVersion: -1 },
      { ...values, expectedVersion: 0.5 },
      { ...values, expectedVersion: 2147483647 },
      { ...values, appointmentUpdatesEmail: 'false', expectedVersion: 0 },
      { ...values, securityEmail: false, expectedVersion: 0 },
      { ...values, inApp: false, expectedVersion: 0 },
      { appointmentUpdatesEmail: true, expectedVersion: 0 },
    ])
      await save(body).expect(400);
    expect((await read().expect(200)).body).toEqual(defaults);
  });

  it('allows one winner for simultaneous first saves and prevents stale overwrites', async () => {
    const results = await Promise.all([
      save({ ...values, expectedVersion: 0 }),
      save({
        appointmentUpdatesEmail: true,
        appointmentRemindersEmail: false,
        credentialUpdatesEmail: true,
        expectedVersion: 0,
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const current = (await read().expect(200)).body as unknown;
    await save({ ...values, expectedVersion: 0 }).expect(409);
    expect((await read().expect(200)).body).toEqual(current);
  });

  it('allows one winner for simultaneous updates of an existing version', async () => {
    await save({ ...values, expectedVersion: 0 }).expect(200);
    const results = await Promise.all([
      save({ ...values, appointmentUpdatesEmail: true, expectedVersion: 1 }),
      save({ ...values, credentialUpdatesEmail: true, expectedVersion: 1 }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect((await read().expect(200)).body).toMatchObject({ version: 2 });
  });
});
