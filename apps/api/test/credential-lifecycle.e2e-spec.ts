import {
  type INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthTokenService } from '../src/modules/identity/auth-token.service';
import { CredentialsService } from '../src/modules/credentials/credentials.service';
import {
  NOTIFICATIONS_PUBLIC_API,
  type NotificationsPublicApi,
} from '../src/modules/notifications/notifications.public';
import { validateEnvironment } from '../src/platform/config/environment';
import { MailTransportService } from '../src/platform/delivery/mail-transport.service';
import { PrismaService } from '../src/platform/persistence/prisma.service';
import type {
  CredentialStatus,
  SystemRole,
} from '../src/generated/prisma/client';

// Expiry scans the domain, so this suite must not share the preview database.
const database = process.env.WORKER_TEST_DATABASE_URL;
if (database && new URL(database).pathname !== '/vetlinx_worker_test')
  throw new Error(
    'Credential lifecycle tests require the dedicated vetlinx_worker_test database',
  );
const describeLifecycle = database ? describe : describe.skip;
type Principal = { id: string; token: string };
type CredentialView = {
  id: string;
  status: string;
  effectiveStatus?: string;
  lifecycleHistory: Array<{ reason: string }>;
};
type PortfolioView = {
  credentials: Array<{ id: string }>;
  displayName: string;
};
type ReviewView = {
  requestId: string;
  credential: CredentialView;
  canRevoke: boolean;
};
describeLifecycle('Governed credential lifecycle (isolated PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let credentials: CredentialsService;
  let owner: Principal;
  let reviewer: Principal;
  let otherReviewer: Principal;
  let operations: Principal;
  let platform: Principal;
  let profileId: string;
  let organizationId: string;
  const slug = `lifecycle-${randomUUID()}`;
  const reason = 'Issuer confirmed this evidence is no longer valid.';
  const accounts: string[] = [];
  const http = () => app.getHttpServer() as Parameters<typeof request>[0];
  const route = (id: string) => `/api/v1/verification-reviews/${id}/revoke`;
  const post = (actor: Principal, id: string, note = reason) =>
    request(http())
      .post(route(id))
      .set('authorization', `Bearer ${actor.token}`)
      .send({ reason: note });
  const day = (offset: number) =>
    new Date(
      `${new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
  async function fixture(
    status: CredentialStatus = 'VERIFIED',
    expiryDate: Date | null = null,
    assigned = reviewer.id,
  ) {
    const credential = await prisma.credential.create({
      data: {
        professionalProfileId: profileId,
        typeCode: 'PROFESSIONAL_LICENCE',
        title: `Licence ${randomUUID()}`,
        issuingOrganization: 'Fixture licensing authority',
        countryCode: 'AE',
        issueDate: new Date('2020-01-01'),
        expiryDate,
        status,
      },
    });
    const review = await prisma.verificationRequest.create({
      data: {
        credentialId: credential.id,
        professionalProfileId: profileId,
        status: 'VERIFIED',
        assignedReviewerId: assigned,
        reviewedAt: new Date(),
        decisions: {
          create: {
            reviewerAccountId: assigned,
            action: 'VERIFIED',
            reason: 'Original evidence independently verified.',
          },
        },
      },
    });
    return { credential, review };
  }
  async function counts(id: string) {
    return Promise.all([
      prisma.credentialLifecycleHistory.count({ where: { credentialId: id } }),
      prisma.auditEvent.count({
        where: {
          resourceId: id,
          action: { in: ['credential.expired', 'credential.revoked'] },
        },
      }),
      prisma.outboxEvent.count({
        where: {
          aggregateId: id,
          name: { in: ['CredentialExpired', 'CredentialRevoked'] },
        },
      }),
      prisma.notification.count({ where: { resourceId: id } }),
    ]);
  }
  beforeAll(async () => {
    const configuration = {
      ...validateEnvironment(process.env),
      DATABASE_URL: database!,
      DELIVERY_ENCRYPTION_KEY: 'c3'.repeat(32),
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(configuration))
      .overrideProvider(MailTransportService)
      .useValue({
        send: jest
          .fn()
          .mockRejectedValue(
            new Error('Real mail is prohibited in lifecycle tests'),
          ),
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
    credentials = app.get(CredentialsService);
    const tokens = app.get(AuthTokenService);
    async function principal(role?: SystemRole): Promise<Principal> {
      const saved = await prisma.account.create({
        data: {
          email: `${randomUUID()}@lifecycle.test`,
          passwordHash: 'fixture-no-login',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });
      accounts.push(saved.id);
      if (role)
        await prisma.accountSystemRole.create({
          data: { accountId: saved.id, role, grantedBy: 'lifecycle-fixture' },
        });
      const familyId = randomUUID();
      const refresh = tokens.generateRefreshToken();
      await prisma.refreshSession.create({
        data: {
          accountId: saved.id,
          familyId,
          tokenHash: refresh.hash,
          expiresAt: refresh.expiresAt,
        },
      });
      return {
        id: saved.id,
        token: await tokens.signAccessToken({
          accountId: saved.id,
          email: saved.email,
          sessionFamilyId: familyId,
        }),
      };
    }
    owner = await principal();
    reviewer = await principal('REVIEWER');
    otherReviewer = await principal('REVIEWER');
    operations = await principal('OPERATIONS_ADMIN');
    platform = await principal('PLATFORM_ADMIN');
    const profile = await prisma.professionalProfile.create({
      data: {
        accountId: owner.id,
        displayName: slug,
        countryCode: 'AE',
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        publicSlug: slug,
      },
    });
    profileId = profile.id;
    const organization = await prisma.organization.create({
      data: {
        legalName: 'Lifecycle employer',
        type: 'CLINIC',
        countryCode: 'AE',
        status: 'VERIFIED',
        members: {
          create: {
            accountId: operations.id,
            role: 'RECRUITER',
          },
        },
      },
    });
    organizationId = organization.id;
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (!prisma || !profileId) return;
    const ids = (
      await prisma.credential.findMany({
        where: { professionalProfileId: profileId },
        select: { id: true },
      })
    ).map((c) => c.id);
    const reviews = (
      await prisma.verificationRequest.findMany({
        where: { professionalProfileId: profileId },
        select: { id: true },
      })
    ).map((r) => r.id);
    await prisma.notification.deleteMany({
      where: { recipientAccountId: { in: accounts } },
    });
    await prisma.auditEvent.deleteMany({
      where: { resourceId: { in: [...ids, ...reviews] } },
    });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...ids, ...reviews] } },
    });
    await prisma.verificationDecision.deleteMany({
      where: { verificationRequestId: { in: reviews } },
    });
    await prisma.verificationRequest.deleteMany({
      where: { id: { in: reviews } },
    });
    await prisma.credentialLifecycleHistory.deleteMany({
      where: { credentialId: { in: ids } },
    });
    await prisma.credential.deleteMany({ where: { id: { in: ids } } });
  });
  afterAll(async () => {
    if (prisma && profileId && accounts.length) {
      if (organizationId) {
        await prisma.organizationMembership.deleteMany({
          where: { organizationId },
        });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
      await prisma.professionalProfile.deleteMany({ where: { id: profileId } });
      await prisma.account.deleteMany({ where: { id: { in: accounts } } });
    }
    await app?.close();
  });
  it('requires a scoped independent reviewer; preserves the original verdict and private history', async () => {
    const { credential, review } = await fixture();
    await request(http()).post(route(review.id)).send({ reason }).expect(401);
    await post(owner, review.id).expect(403);
    await post(otherReviewer, review.id).expect(403);
    const response = await post(reviewer, review.id).expect(200);
    expect(response.body).toMatchObject({
      status: 'REVOKED',
      lifecycleHistory: [
        {
          fromStatus: 'VERIFIED',
          toStatus: 'REVOKED',
          reason,
          source: 'ASSIGNED_REVIEWER',
          verificationRequestId: review.id,
        },
      ],
    });
    expect(
      (response.body as CredentialView).lifecycleHistory[0],
    ).not.toHaveProperty('actorAccountId');
    expect(await counts(credential.id)).toEqual([1, 1, 1, 1]);
    const unchanged = await prisma.verificationRequest.findUniqueOrThrow({
      where: { id: review.id },
      include: { decisions: true },
    });
    expect(unchanged.status).toBe('VERIFIED');
    expect(unchanged.decisions).toHaveLength(1);
    expect(unchanged.decisions[0].reason).toBe(
      'Original evidence independently verified.',
    );
    const wallet = await request(http())
      .get('/api/v1/credentials/me')
      .set('authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      (wallet.body as CredentialView[])[0].lifecycleHistory[0].reason,
    ).toBe(reason);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { resourceId: credential.id },
    });
    expect(JSON.stringify(audit)).not.toContain(reason);
  });
  it('allows operations and platform administration while denying self revocation and validating reasons', async () => {
    const first = await fixture();
    await request(http())
      .post(`/api/v1/credentials/${first.credential.id}/revoke`)
      .set('authorization', `Bearer ${reviewer.token}`)
      .send({ reason })
      .expect(403);
    await post(operations, first.review.id, '   ').expect(400);
    await post(operations, first.review.id).expect(200);
    const second = await fixture();
    await post(platform, second.review.id).expect(200);
    await prisma.accountSystemRole.create({
      data: {
        accountId: owner.id,
        role: 'OPERATIONS_ADMIN',
        grantedBy: 'fixture',
      },
    });
    const third = await fixture();
    await post(owner, third.review.id).expect(403);
    await prisma.accountSystemRole.deleteMany({
      where: { accountId: owner.id },
    });
    const draft = await fixture('DRAFT');
    await post(operations, draft.review.id).expect(409);
    expect(await counts(draft.credential.id)).toEqual([0, 0, 0, 0]);
  });
  it('serializes identical retries and rejects a competing revocation without duplicate side effects', async () => {
    const { credential, review } = await fixture();
    const responses = await Promise.all([
      post(reviewer, review.id),
      post(reviewer, review.id),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    await post(reviewer, review.id).expect(200);
    await post(
      reviewer,
      review.id,
      'A different independent decision needs another action.',
    ).expect(409);
    await post(operations, review.id).expect(409);
    expect(await counts(credential.id)).toEqual([1, 1, 1, 1]);
    const competing = await fixture();
    const outcomes = await Promise.all([
      post(reviewer, competing.review.id),
      post(operations, competing.review.id),
    ]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await counts(competing.credential.id)).toEqual([1, 1, 1, 1]);
  });
  it('expires strictly after the recorded UTC date, with once-only history under concurrent worker cycles', async () => {
    const expired = await fixture('VERIFIED', day(-1));
    const today = await fixture('VERIFIED', day(0));
    const future = await fixture('VERIFIED', day(2));
    const perpetual = await fixture();
    const draft = await fixture('DRAFT', day(-1));
    const before = await request(http())
      .get('/api/v1/credentials/me')
      .set('authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      (before.body as CredentialView[]).find(
        (c) => c.id === expired.credential.id,
      ),
    ).toMatchObject({ status: 'VERIFIED', effectiveStatus: 'EXPIRED' });
    const runs = await Promise.all([
      credentials.expireDue(new Date(day(0).getTime() + 86399999)),
      credentials.expireDue(day(0)),
    ]);
    expect(runs.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await credentials.expireDue(day(0))).toBe(0);
    expect(await counts(expired.credential.id)).toEqual([1, 1, 1, 1]);
    for (const item of [today, future, perpetual])
      expect(
        (
          await prisma.credential.findUniqueOrThrow({
            where: { id: item.credential.id },
          })
        ).status,
      ).toBe('VERIFIED');
    expect(
      (
        await prisma.credential.findUniqueOrThrow({
          where: { id: draft.credential.id },
        })
      ).status,
    ).toBe('DRAFT');
    expect(await credentials.expireDue(day(1))).toBe(1);
    expect(
      await prisma.credentialLifecycleHistory.findFirstOrThrow({
        where: { credentialId: today.credential.id },
      }),
    ).toMatchObject({
      actorAccountId: null,
      source: 'EXPIRY_WORKER',
      fromStatus: 'VERIFIED',
      toStatus: 'EXPIRED',
    });
  });
  it('keeps a concurrent expiry and revocation monotonic and records the actual previous status', async () => {
    const { credential, review } = await fixture('VERIFIED', day(-1));
    const [response] = await Promise.all([
      post(reviewer, review.id),
      credentials.expireDue(day(0)),
    ]);
    expect(response.status).toBe(200);
    expect(
      (
        await prisma.credential.findUniqueOrThrow({
          where: { id: credential.id },
        })
      ).status,
    ).toBe('REVOKED');
    const history = await prisma.credentialLifecycleHistory.findMany({
      where: { credentialId: credential.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual(
      history.length === 1
        ? [['VERIFIED', 'REVOKED']]
        : [
            ['VERIFIED', 'EXPIRED'],
            ['EXPIRED', 'REVOKED'],
          ],
    );
    expect(await credentials.expireDue(day(1))).toBe(0);
  });
  it('removes revoked and time-expired evidence from public claims, CV and matching without hiding the profile', async () => {
    const current = await fixture();
    const expired = await fixture('VERIFIED', day(-1));
    const publicBefore = await request(http())
      .get(`/api/v1/portfolio/public/${slug}`)
      .expect(200);
    expect(
      (publicBefore.body as PortfolioView).credentials.map((c) => c.id),
    ).toEqual([current.credential.id]);
    const candidatesBefore = await request(http())
      .get(`/api/v1/organizations/${organizationId}/candidates`)
      .query({ q: slug })
      .set('authorization', `Bearer ${operations.token}`)
      .expect(200);
    expect(candidatesBefore.body).toHaveLength(1);
    await post(reviewer, current.review.id).expect(200);
    const published = await request(http())
      .get(`/api/v1/portfolio/public/${slug}`)
      .expect(200);
    expect((published.body as PortfolioView).credentials).toEqual([]);
    expect((published.body as PortfolioView).displayName).toBe(slug);
    const candidates = await request(http())
      .get(`/api/v1/organizations/${organizationId}/candidates`)
      .query({ q: slug })
      .set('authorization', `Bearer ${operations.token}`)
      .expect(200);
    expect(candidates.body).toEqual([]);
    const cv = await request(http())
      .get('/api/v1/portfolio/me/cv.txt')
      .set('authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(cv.text).not.toContain(current.credential.title);
    expect(cv.text).not.toContain(expired.credential.title);
    expect(
      await prisma.professionalProfile.findUniqueOrThrow({
        where: { id: profileId },
      }),
    ).toMatchObject({ visibility: 'PUBLIC', status: 'ACTIVE' });
  });
  it('scopes private lifecycle records to assigned reviewers, with governed operations access', async () => {
    const mine = await fixture();
    const other = await fixture('VERIFIED', null, otherReviewer.id);
    const response = await request(http())
      .get('/api/v1/verification-reviews/lifecycle')
      .set('authorization', `Bearer ${reviewer.token}`)
      .expect(200);
    expect((response.body as ReviewView[]).map((r) => r.requestId)).toEqual([
      mine.review.id,
    ]);
    const all = await request(http())
      .get('/api/v1/verification-reviews/lifecycle')
      .set('authorization', `Bearer ${operations.token}`)
      .expect(200);
    expect((all.body as ReviewView[]).map((r) => r.requestId)).toEqual(
      expect.arrayContaining([mine.review.id, other.review.id]),
    );
    await post(reviewer, mine.review.id).expect(200);
    const changed = await request(http())
      .get('/api/v1/verification-reviews/lifecycle')
      .set('authorization', `Bearer ${reviewer.token}`)
      .expect(200);
    expect((changed.body as ReviewView[])[0]).toMatchObject({
      originalReviewStatus: 'VERIFIED',
      canRevoke: false,
      credential: { status: 'REVOKED' },
    });
  });
  it('rolls back status, history, audit and event if notification persistence fails', async () => {
    const { credential } = await fixture();
    const notifications = app.get<NotificationsPublicApi>(
      NOTIFICATIONS_PUBLIC_API,
    );
    jest
      .spyOn(notifications, 'enqueue')
      .mockRejectedValueOnce(new Error('fixture notification failure'));
    await expect(
      credentials.revokeCredential(
        operations.id,
        credential.id,
        reason,
        randomUUID(),
        'OPERATIONS',
      ),
    ).rejects.toThrow('fixture notification failure');
    expect(
      (
        await prisma.credential.findUniqueOrThrow({
          where: { id: credential.id },
        })
      ).status,
    ).toBe('VERIFIED');
    expect(await counts(credential.id)).toEqual([0, 0, 0, 0]);
  });
  it('prevents duplicate approval and does not restore a changed credential during verification', async () => {
    const { credential, review } = await fixture('SUBMITTED');
    await prisma.verificationDecision.deleteMany({
      where: { verificationRequestId: review.id },
    });
    await prisma.verificationRequest.update({
      where: { id: review.id },
      data: { status: 'UNDER_REVIEW' },
    });
    const approve = () =>
      request(http())
        .post(`/api/v1/verification-reviews/${review.id}/approve`)
        .set('authorization', `Bearer ${reviewer.token}`)
        .send({ reason: 'Evidence checked and approved.' });
    const responses = await Promise.all([approve(), approve()]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.verificationDecision.count({
        where: { verificationRequestId: review.id },
      }),
    ).toBe(1);
    await post(reviewer, review.id).expect(200);
    // Even an inconsistent stale request must not restore revoked evidence.
    await prisma.verificationRequest.update({
      where: { id: review.id },
      data: { status: 'UNDER_REVIEW' },
    });
    await approve().expect(409);
    expect(
      (
        await prisma.credential.findUniqueOrThrow({
          where: { id: credential.id },
        })
      ).status,
    ).toBe('REVOKED');
    expect(
      await prisma.verificationDecision.count({
        where: { verificationRequestId: review.id },
      }),
    ).toBe(1);
  });
});
