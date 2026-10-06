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
import { AuthTokenService } from '../src/modules/identity/auth-token.service';

type View = {
  id: string;
  startsAt: string;
  timeZone: string;
  status: string;
  proposalVersion: number;
  proposedStartsAt: string | null;
  proposalExpiresAt: string | null;
  history: Array<{
    action: string;
    toStatus: string;
    proposedStartsAt: string | null;
  }>;
};
describe('Appointment proposal follow-through', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let organizationId: string;
  let ownerId: string;
  let petId: string;
  let ownerToken: string;
  let strangerToken: string;
  let staffToken: string;
  let recruiterToken: string;
  const accountIds: string[] = [];
  const appointmentIds: string[] = [];
  const at = (days: number) =>
    new Date(Date.now() + days * 86400000).toISOString();
  const http = () => app.getHttpServer() as Parameters<typeof request>[0];
  const ownerRoute = (id: string, command: string) =>
    `/api/v1/appointments/${id}/proposal/${command}`;
  const clinicRoute = (id: string) =>
    `/api/v1/appointments/organizations/${organizationId}/${id}`;
  const proposal = (version: number) => ({
    startsAt: at(4),
    expiresAt: at(1),
    timeZone: 'Asia/Dubai',
    proposalVersion: version,
    reason: 'The clinic has a different time available',
  });
  const creation = () => ({
    requestId: randomUUID(),
    petId,
    organizationId,
    startsAt: at(3),
    timeZone: 'Asia/Dubai',
    visitReason: 'Routine wellness visit',
    sharingConsent: true,
  });
  async function appointment() {
    const input = creation();
    const response = await request(http())
      .post('/api/v1/appointments')
      .set('authorization', `Bearer ${ownerToken}`)
      .send(input)
      .expect(201);
    const view = response.body as View;
    appointmentIds.push(view.id);
    return { view, input };
  }
  async function propose(view: View) {
    const response = await request(http())
      .post(`${clinicRoute(view.id)}/proposal`)
      .set('authorization', `Bearer ${staffToken}`)
      .send(proposal(view.proposalVersion))
      .expect(201);
    return response.body as View;
  }
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
    async function account(label: string) {
      const saved = await prisma.account.create({
        data: {
          email: `${label}-${randomUUID()}@followthrough.test`,
          passwordHash: 'integration-fixture-no-password-login',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });
      accountIds.push(saved.id);
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
    const owner = await account('owner');
    ownerId = owner.id;
    ownerToken = owner.token;
    strangerToken = (await account('stranger')).token;
    const staff = await account('staff');
    staffToken = staff.token;
    const recruiter = await account('recruiter');
    recruiterToken = recruiter.token;
    const clinic = await prisma.organization.create({
      data: {
        legalName: 'Followthrough Fixture Clinic',
        countryCode: 'AE',
        type: 'CLINIC',
        status: 'VERIFIED',
        city: 'Dubai',
        phone: '+97140000000',
        acceptsAppointmentRequests: true,
        members: {
          create: [
            { accountId: staff.id, role: 'STAFF' },
            { accountId: recruiter.id, role: 'RECRUITER' },
          ],
        },
      },
    });
    organizationId = clinic.id;
    const ownerProfile = await prisma.ownerProfile.create({
      data: {
        accountId: owner.id,
        displayName: 'Fixture Owner',
        countryCode: 'AE',
        phone: '+971501234567',
        pets: { create: { name: 'Luna', speciesCode: 'CAT', sex: 'FEMALE' } },
      },
      include: { pets: true },
    });
    petId = ownerProfile.pets[0].id;
  });

  it('keeps requested time unchanged until owner acceptance and records durable proposal history', async () => {
    const { view } = await appointment();
    const proposed = await propose(view);
    expect(proposed).toMatchObject({
      startsAt: view.startsAt,
      status: 'REQUESTED',
      proposalVersion: 1,
    });
    expect(proposed.proposedStartsAt).not.toBe(view.startsAt);
    expect(proposed.history.map((entry) => entry.action)).toEqual([
      'REQUESTED',
      'PROPOSED',
    ]);
    expect(
      await prisma.auditEvent.count({
        where: { resourceId: view.id, action: 'appointment.proposed' },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: view.id, name: 'AppointmentTimeProposed' },
      }),
    ).toBe(1);
    await request(http())
      .patch(clinicRoute(view.id))
      .set('authorization', `Bearer ${staffToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(409);
  });

  it('restricts clinic commands to staff and owner responses to the requesting owner', async () => {
    const { view } = await appointment();
    await request(http())
      .post(`${clinicRoute(view.id)}/proposal`)
      .set('authorization', `Bearer ${recruiterToken}`)
      .send(proposal(0))
      .expect(403);
    await request(http())
      .post(`${clinicRoute(view.id)}/proposal`)
      .set('authorization', `Bearer ${strangerToken}`)
      .send(proposal(0))
      .expect(403);
    const proposed = await propose(view);
    await request(http())
      .post(ownerRoute(view.id, 'accept'))
      .set('authorization', `Bearer ${strangerToken}`)
      .send({ proposalVersion: proposed.proposalVersion })
      .expect(404);
  });

  it('permits only one clinic proposal when concurrent updates use the same version', async () => {
    const { view } = await appointment();
    const results = await Promise.all([
      request(http())
        .post(`${clinicRoute(view.id)}/proposal`)
        .set('authorization', `Bearer ${staffToken}`)
        .send(proposal(0)),
      request(http())
        .post(`${clinicRoute(view.id)}/proposal`)
        .set('authorization', `Bearer ${staffToken}`)
        .send({ ...proposal(0), startsAt: at(5) }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.appointmentHistory.count({
        where: { appointmentId: view.id, action: 'PROPOSED' },
      }),
    ).toBe(1);
  });

  it('accepts a proposal, confirms the replacement, and preserves original request idempotency', async () => {
    const { view, input } = await appointment();
    const proposed = await propose(view);
    const response = await request(http())
      .post(ownerRoute(view.id, 'accept'))
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ proposalVersion: proposed.proposalVersion })
      .expect(201);
    const accepted = response.body as View;
    expect(accepted).toMatchObject({
      status: 'CONFIRMED',
      startsAt: proposed.proposedStartsAt,
      proposedStartsAt: null,
      proposalVersion: 2,
    });
    expect(accepted.history.at(-1)).toMatchObject({
      action: 'PROPOSAL_ACCEPTED',
      toStatus: 'CONFIRMED',
      proposedStartsAt: proposed.proposedStartsAt,
    });
    await request(http())
      .post(ownerRoute(view.id, 'accept'))
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ proposalVersion: proposed.proposalVersion })
      .expect(409);
    const replay = await request(http())
      .post('/api/v1/appointments')
      .set('authorization', `Bearer ${ownerToken}`)
      .send(input)
      .expect(201);
    expect((replay.body as View).startsAt).toBe(accepted.startsAt);
  });

  it('preserves replay of a legacy request by appending its original time before rescheduling', async () => {
    const { view, input } = await appointment();
    await prisma.appointmentHistory.updateMany({
      where: { appointmentId: view.id },
      data: {
        action: 'STATUS_CHANGED',
        proposedStartsAt: null,
        proposedTimeZone: null,
      },
    });
    const proposed = await propose(view);
    await request(http())
      .post(ownerRoute(view.id, 'accept'))
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ proposalVersion: proposed.proposalVersion })
      .expect(201);
    const replay = await request(http())
      .post('/api/v1/appointments')
      .set('authorization', `Bearer ${ownerToken}`)
      .send(input)
      .expect(201);
    expect((replay.body as View).startsAt).toBe(proposed.proposedStartsAt);
    expect(
      await prisma.appointmentHistory.count({
        where: { appointmentId: view.id, action: 'REQUEST_SNAPSHOT' },
      }),
    ).toBe(1);
  });

  it('leaves the confirmed time in place when a rescheduling proposal is rejected', async () => {
    const { view } = await appointment();
    const confirmation = await request(http())
      .patch(clinicRoute(view.id))
      .set('authorization', `Bearer ${staffToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);
    const confirmed = confirmation.body as View;
    await request(http())
      .post(`${clinicRoute(view.id)}/proposal`)
      .set('authorization', `Bearer ${staffToken}`)
      .send({ ...proposal(confirmed.proposalVersion), expiresAt: at(3.5) })
      .expect(400);
    const proposed = await propose(confirmed);
    const rejected = await request(http())
      .post(ownerRoute(view.id, 'reject'))
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ proposalVersion: proposed.proposalVersion })
      .expect(201);
    expect(rejected.body as View).toMatchObject({
      status: 'CONFIRMED',
      startsAt: view.startsAt,
      proposedStartsAt: null,
    });
  });

  it('rejects expired acceptance and allows closing the expired proposal without changing the original', async () => {
    const { view } = await appointment();
    const proposed = await propose(view);
    await prisma.appointment.update({
      where: { id: view.id },
      data: { proposalExpiresAt: new Date(Date.now() - 1000) },
    });
    await request(http())
      .post(ownerRoute(view.id, 'accept'))
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ proposalVersion: proposed.proposalVersion })
      .expect(409);
    const closed = await request(http())
      .post(ownerRoute(view.id, 'reject'))
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ proposalVersion: proposed.proposalVersion })
      .expect(201);
    expect(closed.body as View).toMatchObject({
      startsAt: view.startsAt,
      status: 'REQUESTED',
      proposedStartsAt: null,
    });
    expect((closed.body as View).history.at(-1)?.action).toBe(
      'PROPOSAL_EXPIRED',
    );
  });

  it('clears the pending proposal on cancellation and never accepts a cancelled appointment', async () => {
    const { view } = await appointment();
    const proposed = await propose(view);
    const cancelled = await request(http())
      .post(`/api/v1/appointments/${view.id}/cancel`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect(cancelled.body as View).toMatchObject({
      status: 'CANCELLED',
      proposedStartsAt: null,
      proposalExpiresAt: null,
    });
    await request(http())
      .post(ownerRoute(view.id, 'accept'))
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ proposalVersion: proposed.proposalVersion })
      .expect(409);
  });

  it('validates timezone, future time, deadline, version and explanation', async () => {
    const { view } = await appointment();
    for (const invalid of [
      { ...proposal(0), timeZone: 'Invalid/Zone' },
      { ...proposal(0), startsAt: at(-1) },
      { ...proposal(0), expiresAt: at(-1) },
      { ...proposal(0), expiresAt: at(6) },
      { ...proposal(0), reason: '   ' },
      { ...proposal(0), proposalVersion: -1 },
    ]) {
      await request(http())
        .post(`${clinicRoute(view.id)}/proposal`)
        .set('authorization', `Bearer ${staffToken}`)
        .send(invalid)
        .expect(400);
    }
    expect(
      await prisma.appointmentHistory.count({
        where: { appointmentId: view.id },
      }),
    ).toBe(1);
  });

  it('resolves competing owner responses once and rejects superseded versions', async () => {
    const { view } = await appointment();
    const first = await propose(view);
    const current = await propose(first);
    await request(http())
      .post(ownerRoute(view.id, 'accept'))
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ proposalVersion: first.proposalVersion })
      .expect(409);
    const responses = await Promise.all(
      ['accept', 'reject'].map((command) =>
        request(http())
          .post(ownerRoute(view.id, command))
          .set('authorization', `Bearer ${ownerToken}`)
          .send({ proposalVersion: current.proposalVersion }),
      ),
    );
    expect(responses.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.appointmentHistory.count({
        where: {
          appointmentId: view.id,
          action: { in: ['PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED'] },
        },
      }),
    ).toBe(1);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.appointmentHistory.deleteMany({
        where: { appointmentId: { in: appointmentIds } },
      });
      await prisma.appointment.deleteMany({
        where: { id: { in: appointmentIds } },
      });
      await prisma.pet.deleteMany({ where: { id: petId } });
      await prisma.ownerProfile.deleteMany({ where: { accountId: ownerId } });
      if (organizationId)
        await prisma.organization.delete({ where: { id: organizationId } });
      await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
      await prisma.auditEvent.deleteMany({
        where: { actorId: { in: accountIds } },
      });
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: appointmentIds } },
      });
    }
    await app?.close();
  });
});
