import {
  type INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/persistence/prisma.service';

function field(body: unknown, key: string): string {
  if (typeof body !== 'object' || body === null || !(key in body))
    throw new Error(`Missing ${key}`);
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== 'string') throw new Error(`Invalid ${key}`);
  return value;
}

describe('B2C owner-to-clinic journey', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const accounts: string[] = [];
  const accountTokens = new Map<string, string>();
  let ownerToken: string;
  let strangerToken: string;
  let clinicToken: string;
  let staffToken: string;
  let recruiterToken: string;
  let organizationId: string;
  let petId: string;
  let appointmentId: string;
  const startsAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const input = () => ({
    requestId: randomUUID(),
    petId,
    organizationId,
    startsAt,
    timeZone: 'Asia/Dubai',
    visitReason: 'Routine annual check-up',
    sharingConsent: true,
  });
  const http = () => app.getHttpServer() as Parameters<typeof request>[0];

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
    async function account(label: string) {
      const response = await request(http())
        .post('/api/v1/auth/register')
        .send({
          email: `${label}-${randomUUID()}@b2c.test`,
          password: 'B2C-Integration-Account-2026',
        })
        .expect(201);
      const token = field(response.body as unknown, 'accessToken');
      const me = await request(http())
        .get('/api/v1/auth/me')
        .set('authorization', `Bearer ${token}`)
        .expect(200);
      const id = field(me.body as unknown, 'accountId');
      accounts.push(id);
      accountTokens.set(id, token);
      return token;
    }
    ownerToken = await account('owner');
    strangerToken = await account('stranger');
    clinicToken = await account('clinic');
    staffToken = await account('staff');
    recruiterToken = await account('recruiter');
    await request(http())
      .put('/api/v1/owners/me')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        displayName: 'Pet Owner',
        countryCode: 'AE',
        phone: '+971501234567',
      })
      .expect(200);
    const pet = await request(http())
      .post('/api/v1/owners/me/pets')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Luna', speciesCode: 'CAT', sex: 'FEMALE' })
      .expect(201);
    petId = field(pet.body as unknown, 'id');
    const clinic = await request(http())
      .post('/api/v1/organizations/me')
      .set('authorization', `Bearer ${clinicToken}`)
      .send({
        legalName: 'B2C Test Clinic',
        countryCode: 'AE',
        type: 'CLINIC',
        city: 'Dubai',
        phone: '+97140000000',
      })
      .expect(201);
    const workspace = clinic.body as { organization: { id: string } };
    organizationId = workspace.organization.id;
    for (const [token, role] of [
      [staffToken, 'STAFF'],
      [recruiterToken, 'RECRUITER'],
    ] as const) {
      const id = [...accountTokens].find(([, value]) => value === token)?.[0];
      if (!id) throw new Error('Missing fixture account');
      await prisma.organizationMembership.create({
        data: { organizationId, accountId: id, role },
      });
    }
  });

  it('keeps owner identity separate from professional onboarding', async () => {
    await request(http())
      .get('/api/v1/owners/me')
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    await request(http())
      .get('/api/v1/professionals/me')
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(404);
    await request(http()).get('/api/v1/owners/me/pets').expect(401);
  });

  it('rejects other accounts reading, editing, or booking with a private pet', async () => {
    await request(http())
      .patch(`/api/v1/owners/me/pets/${petId}`)
      .set('authorization', `Bearer ${strangerToken}`)
      .send({ name: 'Stolen pet' })
      .expect(404);
    await request(http())
      .post('/api/v1/appointments')
      .set('authorization', `Bearer ${strangerToken}`)
      .send(input())
      .expect(404);
    await request(http())
      .get('/api/v1/appointments/me')
      .set('authorization', `Bearer ${strangerToken}`)
      .expect(200)
      .expect([]);
  });

  it('requires clinic verification and an explicit opt-in before public discovery', async () => {
    await request(http())
      .patch(`/api/v1/clinics/${organizationId}/booking`)
      .set('authorization', `Bearer ${clinicToken}`)
      .send({ enabled: true })
      .expect(409);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: 'VERIFIED' },
    });
    await request(http())
      .post('/api/v1/appointments')
      .set('authorization', `Bearer ${ownerToken}`)
      .send(input())
      .expect(409);
    await request(http())
      .patch(`/api/v1/clinics/${organizationId}/booking`)
      .set('authorization', `Bearer ${staffToken}`)
      .send({ enabled: true })
      .expect(403);
    await request(http())
      .patch(`/api/v1/clinics/${organizationId}/booking`)
      .set('authorization', `Bearer ${clinicToken}`)
      .send({ enabled: true })
      .expect(200);
    const directory = await request(http())
      .get('/api/v1/clinics?q=B2C')
      .expect(200);
    expect(directory.body as unknown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: organizationId, phone: '+97140000000' }),
      ]),
    );
    expect(JSON.stringify(directory.body)).not.toContain('memberships');
    expect(JSON.stringify(directory.body)).not.toContain('@b2c.test');
  });

  it('validates consent, dates, time zones, and pet birth dates', async () => {
    await request(http())
      .post('/api/v1/appointments')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ ...input(), sharingConsent: false })
      .expect(400);
    await request(http())
      .post('/api/v1/appointments')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ ...input(), startsAt: '2020-01-01T00:00:00Z' })
      .expect(400);
    await request(http())
      .post('/api/v1/appointments')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ ...input(), timeZone: 'not/a-time-zone' })
      .expect(400);
    await request(http())
      .post('/api/v1/owners/me/pets')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Future pet',
        speciesCode: 'DOG',
        sex: 'UNKNOWN',
        birthDate: '2999-01-01',
      })
      .expect(400);
  });

  it('persists one appointment for parallel retries with consent, audit, outbox, and notifications', async () => {
    const dto = input();
    const responses = await Promise.all([
      request(http())
        .post('/api/v1/appointments')
        .set('authorization', `Bearer ${ownerToken}`)
        .send(dto),
      request(http())
        .post('/api/v1/appointments')
        .set('authorization', `Bearer ${ownerToken}`)
        .send(dto),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    appointmentId = field(responses[0].body as unknown, 'id');
    expect(field(responses[1].body as unknown, 'id')).toBe(appointmentId);
    expect(
      await prisma.appointment.count({ where: { id: appointmentId } }),
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { resourceId: appointmentId, action: 'appointment.requested' },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: appointmentId, name: 'AppointmentRequested' },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { resourceId: appointmentId, kind: 'APPOINTMENT_REQUESTED' },
      }),
    ).toBe(2);
    await request(http())
      .post('/api/v1/appointments')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ ...dto, visitReason: 'Changed content using same identifier' })
      .expect(409);
  });

  it('allows clinic staff to confirm requests but denies recruiters, outsiders, and future completion', async () => {
    await request(http())
      .get(`/api/v1/appointments/organizations/${organizationId}`)
      .set('authorization', `Bearer ${recruiterToken}`)
      .expect(403);
    await request(http())
      .get(`/api/v1/appointments/organizations/${organizationId}`)
      .set('authorization', `Bearer ${strangerToken}`)
      .expect(403);
    await request(http())
      .patch(
        `/api/v1/appointments/organizations/${organizationId}/${appointmentId}`,
      )
      .set('authorization', `Bearer ${staffToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);
    await request(http())
      .patch(
        `/api/v1/appointments/organizations/${organizationId}/${appointmentId}`,
      )
      .set('authorization', `Bearer ${staffToken}`)
      .send({ status: 'COMPLETED' })
      .expect(409);
    await request(http())
      .post(`/api/v1/appointments/${appointmentId}/cancel`)
      .set('authorization', `Bearer ${strangerToken}`)
      .expect(404);
  });

  it('preserves appointment history when an owner archives a pet and cancels', async () => {
    await request(http())
      .post(`/api/v1/owners/me/pets/${petId}/archive`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(201);
    await request(http())
      .get('/api/v1/owners/me/pets')
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect([]);
    await request(http())
      .post('/api/v1/appointments')
      .set('authorization', `Bearer ${ownerToken}`)
      .send(input())
      .expect(404);
    await request(http())
      .post(`/api/v1/appointments/${appointmentId}/cancel`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(201);
    const saved = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { history: true },
    });
    expect(saved.status).toBe('CANCELLED');
    expect(saved.petName).toBe('Luna');
    expect(saved.history).toHaveLength(3);
    await request(http())
      .patch(
        `/api/v1/appointments/organizations/${organizationId}/${appointmentId}`,
      )
      .set('authorization', `Bearer ${staffToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(409);
  });

  it('publishes professional portfolios independently of employment and respects candidate privacy and expiry', async () => {
    const created = await request(http())
      .post('/api/v1/professionals/me')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ displayName: 'B2C Professional', countryCode: 'AE' })
      .expect(201);
    const professionalId = field(created.body as unknown, 'id');
    const credential = await prisma.credential.create({
      data: {
        professionalProfileId: professionalId,
        typeCode: 'PROFESSIONAL_LICENCE',
        title: 'Pilot credential',
        issuingOrganization: 'Test issuer',
        countryCode: 'AE',
        issueDate: new Date('2019-01-01'),
        expiryDate: new Date('2099-01-01'),
        status: 'VERIFIED',
      },
    });
    const published = await request(http())
      .patch('/api/v1/professionals/me')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ visibility: 'PUBLIC', contactVisibility: 'PRIVATE' })
      .expect(200);
    const slug = field(published.body as unknown, 'publicSlug');
    expect(field(published.body as unknown, 'status')).toBe('ACTIVE');
    await request(http()).get(`/api/v1/portfolio/public/${slug}`).expect(200);
    const candidates = await request(http())
      .get(`/api/v1/organizations/${organizationId}/candidates?q=B2C`)
      .set('authorization', `Bearer ${clinicToken}`)
      .expect(200);
    expect(candidates.body as unknown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: professionalId,
          account: { email: null },
        }),
      ]),
    );
    await request(http())
      .patch('/api/v1/professionals/me')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ visibility: 'PRIVATE' })
      .expect(200);
    await request(http())
      .get(`/api/v1/organizations/${organizationId}/candidates?q=B2C`)
      .set('authorization', `Bearer ${clinicToken}`)
      .expect(200)
      .expect([]);
    await prisma.credential.update({
      where: { id: credential.id },
      data: { expiryDate: new Date('2020-01-01') },
    });
    await request(http())
      .patch('/api/v1/professionals/me')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ visibility: 'PUBLIC' })
      .expect(409);
    const portfolio = await request(http())
      .get('/api/v1/portfolio/me')
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(portfolio.body as unknown).toMatchObject({
      credentials: [],
      trust: { verifiedCredentialCount: 0 },
    });
  });

  it('blocks a suspended account even while its access token is valid', async () => {
    const id = accounts.find(
      (account) => accountTokens.get(account) === ownerToken,
    );
    await prisma.account.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });
    await request(http())
      .get('/api/v1/owners/me')
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(401);
  });

  afterAll(async () => {
    if (prisma) {
      const appointments = await prisma.appointment.findMany({
        where: { requesterAccountId: { in: accounts } },
        select: { id: true },
      });
      const owners = await prisma.ownerProfile.findMany({
        where: { accountId: { in: accounts } },
        select: { id: true },
      });
      const pets = await prisma.pet.findMany({
        where: { ownerProfileId: { in: owners.map((owner) => owner.id) } },
        select: { id: true },
      });
      const ids = [
        ...accounts,
        ...appointments.map((item) => item.id),
        ...owners.map((item) => item.id),
        ...pets.map((item) => item.id),
        ...(organizationId ? [organizationId] : []),
      ];
      await prisma.appointmentHistory.deleteMany({
        where: { appointmentId: { in: appointments.map((item) => item.id) } },
      });
      await prisma.appointment.deleteMany({
        where: { requesterAccountId: { in: accounts } },
      });
      await prisma.pet.deleteMany({
        where: { id: { in: pets.map((item) => item.id) } },
      });
      await prisma.ownerProfile.deleteMany({
        where: { accountId: { in: accounts } },
      });
      if (organizationId)
        await prisma.organization.delete({ where: { id: organizationId } });
      const professionals = await prisma.professionalProfile.findMany({
        where: { accountId: { in: accounts } },
        select: { id: true },
      });
      await prisma.credential.deleteMany({
        where: {
          professionalProfileId: {
            in: professionals.map((profile) => profile.id),
          },
        },
      });
      await prisma.professionalProfile.deleteMany({
        where: { accountId: { in: accounts } },
      });
      await prisma.account.deleteMany({ where: { id: { in: accounts } } });
      await prisma.auditEvent.deleteMany({
        where: { actorId: { in: accounts } },
      });
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: ids } },
      });
    }
    await app?.close();
  });
});
