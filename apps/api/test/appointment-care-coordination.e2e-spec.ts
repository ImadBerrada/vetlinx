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
import { AppointmentsService } from '../src/modules/appointments/appointments.service';
import {
  NOTIFICATIONS_PUBLIC_API,
  type NotificationsPublicApi,
} from '../src/modules/notifications/notifications.public';
import {
  ORGANIZATIONS_PUBLIC_API,
  type OrganizationsPublicApi,
} from '../src/modules/organizations/organizations.public';
import type { AppointmentStatus } from '../src/generated/prisma/client';

type Actor = { id: string; token: string };
type View = {
  id: string;
  startsAt: string;
  timeZone: string;
  status: string;
  checkedInAt: string | null;
  proposedStartsAt: string | null;
  proposalInitiator: string | null;
  proposalVersion: number;
  history: Array<{
    action: string;
    proposalVersion: number | null;
    proposalInitiator: string | null;
  }>;
};
describe('Appointment care coordination', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: AppointmentsService;
  let owner: Actor;
  let stranger: Actor;
  let staff: Actor;
  let otherStaff: Actor;
  let recruiter: Actor;
  let organizationId: string;
  let ownerProfileId: string;
  let petId: string;
  const accountIds: string[] = [];
  const appointmentIds: string[] = [];
  const at = (hours: number) =>
    new Date(Date.now() + hours * 3600000).toISOString();
  const http = () => app.getHttpServer() as Parameters<typeof request>[0];
  const ownerRoute = (id: string, suffix = 'reschedule') =>
    `/api/v1/appointments/${id}/${suffix}`;
  const clinicRoute = (id: string, suffix = '') =>
    `/api/v1/appointments/organizations/${organizationId}/${id}${suffix ? `/${suffix}` : ''}`;
  const post = (actor: Actor, url: string, body: object) =>
    request(http())
      .post(url)
      .set('authorization', `Bearer ${actor.token}`)
      .send(body);
  const patch = (actor: Actor, id: string, body: object) =>
    request(http())
      .patch(clinicRoute(id))
      .set('authorization', `Bearer ${actor.token}`)
      .send(body);
  const proposal = (proposalVersion = 0) => ({
    proposalVersion,
    startsAt: at(8),
    expiresAt: at(1),
    timeZone: 'Asia/Dubai',
    reason: 'Please move this routine visit to a later time.',
  });
  async function fixture(
    status: AppointmentStatus = 'CONFIRMED',
    startsAt = at(5),
  ) {
    const row = await prisma.appointment.create({
      data: {
        requesterAccountId: owner.id,
        ownerProfileId,
        petId,
        organizationId,
        ownerName: 'Care Fixture Owner',
        contactPhone: '+971500001234',
        petName: 'Luna',
        speciesCode: 'CAT',
        clinicName: 'Care Fixture Clinic',
        startsAt: new Date(startsAt),
        timeZone: 'Asia/Dubai',
        visitReason: 'Private visit details',
        sharingConsentAt: new Date(),
        status,
        history: {
          create: {
            actorAccountId: owner.id,
            toStatus: 'REQUESTED',
            action: 'REQUESTED',
            proposedStartsAt: new Date(startsAt),
            proposedTimeZone: 'Asia/Dubai',
          },
        },
      },
    });
    appointmentIds.push(row.id);
    return row;
  }
  async function ownerRequest(id: string) {
    const input = proposal();
    const response = await post(owner, ownerRoute(id), input).expect(201);
    return { input, view: response.body as View };
  }
  async function sideEffects(id: string) {
    return Promise.all([
      prisma.appointmentHistory.count({
        where: { appointmentId: id, action: { not: 'REQUESTED' } },
      }),
      prisma.auditEvent.count({ where: { resourceId: id } }),
      prisma.outboxEvent.count({ where: { aggregateId: id } }),
      prisma.notification.count({ where: { resourceId: id } }),
    ]);
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
    service = app.get(AppointmentsService);
    const tokens = app.get(AuthTokenService);
    async function actor(): Promise<Actor> {
      const account = await prisma.account.create({
        data: {
          email: `${randomUUID()}@care.test`,
          passwordHash: 'fixture-no-login',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });
      accountIds.push(account.id);
      const familyId = randomUUID();
      const refresh = tokens.generateRefreshToken();
      await prisma.refreshSession.create({
        data: {
          accountId: account.id,
          familyId,
          tokenHash: refresh.hash,
          expiresAt: refresh.expiresAt,
        },
      });
      return {
        id: account.id,
        token: await tokens.signAccessToken({
          accountId: account.id,
          email: account.email,
          sessionFamilyId: familyId,
        }),
      };
    }
    owner = await actor();
    stranger = await actor();
    staff = await actor();
    otherStaff = await actor();
    recruiter = await actor();
    const clinic = await prisma.organization.create({
      data: {
        legalName: 'Care Fixture Clinic',
        type: 'CLINIC',
        status: 'VERIFIED',
        countryCode: 'AE',
        acceptsAppointmentRequests: true,
        members: {
          create: [
            { accountId: staff.id, role: 'STAFF' },
            { accountId: otherStaff.id, role: 'ADMIN' },
            { accountId: recruiter.id, role: 'RECRUITER' },
          ],
        },
      },
    });
    organizationId = clinic.id;
    const profile = await prisma.ownerProfile.create({
      data: {
        accountId: owner.id,
        displayName: 'Care Fixture Owner',
        countryCode: 'AE',
        phone: '+971500001234',
        pets: { create: { name: 'Luna', speciesCode: 'CAT', sex: 'FEMALE' } },
      },
      include: { pets: true },
    });
    ownerProfileId = profile.id;
    petId = profile.pets[0].id;
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.notification.deleteMany({
      where: { resourceId: { in: appointmentIds } },
    });
    await prisma.auditEvent.deleteMany({
      where: { resourceId: { in: appointmentIds } },
    });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: appointmentIds } },
    });
    await prisma.appointmentHistory.deleteMany({
      where: { appointmentId: { in: appointmentIds } },
    });
    await prisma.appointment.deleteMany({
      where: { id: { in: appointmentIds } },
    });
    appointmentIds.length = 0;
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.organizationMembership.deleteMany({
        where: { organizationId },
      });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.pet.deleteMany({ where: { ownerProfileId } });
      await prisma.ownerProfile.deleteMany({ where: { id: ownerProfileId } });
      await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    await app?.close();
  });
  it('keeps the confirmed time unchanged, records owner origin and serializes exact request retries', async () => {
    const row = await fixture();
    const input = proposal();
    const responses = await Promise.all([
      post(owner, ownerRoute(row.id), input),
      post(owner, ownerRoute(row.id), input),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const view = responses[0].body as View;
    expect(view).toMatchObject({
      startsAt: row.startsAt.toISOString(),
      status: 'CONFIRMED',
      proposalInitiator: 'OWNER',
      proposalVersion: 1,
      proposedStartsAt: input.startsAt,
    });
    expect(view.history.at(-1)).toMatchObject({
      action: 'OWNER_RESCHEDULE_REQUESTED',
      proposalInitiator: 'OWNER',
      proposalVersion: 1,
    });
    expect(await sideEffects(row.id)).toEqual([1, 1, 1, 2]);
    await post(owner, ownerRoute(row.id), {
      ...input,
      reason: 'A different request cannot reuse this old version.',
    }).expect(409);
    expect(
      await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: row.id },
      }),
    ).toMatchObject({
      name: 'AppointmentTimeProposed',
      payload: {
        proposalInitiator: 'OWNER',
        action: 'OWNER_RESCHEDULE_REQUESTED',
      },
    });
  });
  it('enforces owner privacy, clinic scope, and mutually exclusive proposal origin', async () => {
    const row = await fixture();
    await post(stranger, ownerRoute(row.id), proposal()).expect(404);
    await post(recruiter, clinicRoute(row.id, 'check-in'), {
      proposalVersion: 0,
    }).expect(403);
    const { view } = await ownerRequest(row.id);
    await post(owner, ownerRoute(row.id, 'proposal/accept'), {
      proposalVersion: view.proposalVersion,
    }).expect(409);
    await post(staff, clinicRoute(row.id, 'proposal'), proposal(1)).expect(409);
    const other = await fixture();
    const clinicProposal = await post(
      staff,
      clinicRoute(other.id, 'proposal'),
      proposal(),
    ).expect(201);
    const cp = clinicProposal.body as View;
    await post(
      owner,
      ownerRoute(other.id),
      proposal(cp.proposalVersion),
    ).expect(409);
    await post(staff, clinicRoute(other.id, 'reschedule/accept'), {
      proposalVersion: cp.proposalVersion,
    }).expect(409);
    await prisma.appointment.update({
      where: { id: other.id },
      data: { proposalInitiator: null },
    });
    await post(owner, ownerRoute(other.id, 'proposal/accept'), {
      proposalVersion: cp.proposalVersion,
    }).expect(201);
    const requested = await fixture('REQUESTED');
    await post(owner, ownerRoute(requested.id), proposal()).expect(409);
  });
  it('accepts only the live owner request, preserves confirmed status and compares exact replay notes', async () => {
    const row = await fixture();
    const { view, input } = await ownerRequest(row.id);
    const body = {
      proposalVersion: view.proposalVersion,
      reason: 'The clinic can accommodate this time.',
    };
    const responses = await Promise.all([
      post(staff, clinicRoute(row.id, 'reschedule/accept'), body),
      post(staff, clinicRoute(row.id, 'reschedule/accept'), body),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0].body as View).toMatchObject({
      startsAt: input.startsAt,
      timeZone: input.timeZone,
      status: 'CONFIRMED',
      proposedStartsAt: null,
      proposalInitiator: null,
      proposalVersion: 2,
    });
    await post(staff, clinicRoute(row.id, 'reschedule/accept'), {
      proposalVersion: 1,
    }).expect(409);
    await post(
      otherStaff,
      clinicRoute(row.id, 'reschedule/accept'),
      body,
    ).expect(409);
    expect(await sideEffects(row.id)).toEqual([2, 2, 2, 3]);
    const history = await prisma.appointmentHistory.findFirstOrThrow({
      where: { appointmentId: row.id, action: 'OWNER_RESCHEDULE_ACCEPTED' },
    });
    expect(history).toMatchObject({
      proposalInitiator: 'OWNER',
      proposedStartsAt: new Date(input.startsAt),
    });
    const original = {
      requestId: row.id,
      petId,
      organizationId,
      startsAt: row.startsAt.toISOString(),
      timeZone: row.timeZone,
      visitReason: row.visitReason,
      sharingConsent: true,
    };
    await post(owner, '/api/v1/appointments', original).expect(201);
  });
  it('declines and withdraws expired requests without changing the authoritative confirmed time', async () => {
    const row = await fixture();
    const { view } = await ownerRequest(row.id);
    await post(staff, clinicRoute(row.id, 'reschedule/decline'), {
      proposalVersion: view.proposalVersion,
    }).expect(400);
    await prisma.appointment.update({
      where: { id: row.id },
      data: { proposalExpiresAt: new Date(Date.now() - 1000) },
    });
    await post(staff, clinicRoute(row.id, 'reschedule/accept'), {
      proposalVersion: 1,
    }).expect(409);
    const note = {
      proposalVersion: 1,
      reason: 'The requested time is unavailable.',
    };
    await post(staff, clinicRoute(row.id, 'reschedule/decline'), note).expect(
      201,
    );
    await post(staff, clinicRoute(row.id, 'reschedule/decline'), note).expect(
      201,
    );
    expect(
      await prisma.appointment.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      startsAt: row.startsAt,
      status: 'CONFIRMED',
      proposalInitiator: null,
    });
    const second = await fixture();
    await ownerRequest(second.id);
    await prisma.appointment.update({
      where: { id: second.id },
      data: { proposalExpiresAt: new Date(Date.now() - 1000) },
    });
    await post(owner, ownerRoute(second.id, 'reschedule/withdraw'), {
      proposalVersion: 1,
    }).expect(201);
    await post(owner, ownerRoute(second.id, 'reschedule/withdraw'), {
      proposalVersion: 1,
    }).expect(201);
    expect(await sideEffects(second.id)).toEqual([2, 2, 2, 4]);
  });
  it('rejects ambiguous instants, bad zones and deadlines beyond either appointment or seven days', async () => {
    const row = await fixture('CONFIRMED', at(480));
    const valid = proposal();
    for (const invalid of [
      { ...valid, startsAt: valid.startsAt.slice(0, 19) },
      { ...valid, expiresAt: valid.expiresAt.slice(0, 19) },
      { ...valid, timeZone: 'not/a-zone' },
      { ...valid, reason: '  ' },
      { ...valid, startsAt: at(240), expiresAt: at(192) },
    ])
      await post(owner, ownerRoute(row.id), invalid).expect(400);
    await post(staff, clinicRoute(row.id, 'proposal'), {
      ...valid,
      startsAt: at(240),
      expiresAt: at(192),
    }).expect(400);
    await post(staff, clinicRoute(row.id, 'proposal'), {
      ...valid,
      startsAt: valid.startsAt.slice(0, 19),
    }).expect(400);
    await post(owner, '/api/v1/appointments', {
      requestId: randomUUID(),
      petId,
      organizationId,
      startsAt: at(20).slice(0, 19),
      timeZone: 'Asia/Dubai',
      visitReason: 'Routine visit',
      sharingConsent: true,
    }).expect(400);
    const near = await fixture();
    await post(owner, ownerRoute(near.id), {
      ...valid,
      expiresAt: at(6),
    }).expect(400);
    const offset = await fixture();
    const input = {
      ...valid,
      startsAt: new Date(valid.startsAt).toISOString().replace('Z', '+00:00'),
    };
    await post(owner, ownerRoute(offset.id), input).expect(201);
  });
  it('records arrival once with operational guards and blocks owner changes after check-in', async () => {
    const early = await fixture('CONFIRMED', at(25));
    await post(staff, clinicRoute(early.id, 'check-in'), {
      proposalVersion: 0,
    }).expect(409);
    const requested = await fixture('REQUESTED');
    await post(staff, clinicRoute(requested.id, 'check-in'), {
      proposalVersion: 0,
    }).expect(409);
    const row = await fixture();
    await ownerRequest(row.id);
    await post(staff, clinicRoute(row.id, 'check-in'), {
      proposalVersion: 1,
    }).expect(409);
    await prisma.appointment.update({
      where: { id: row.id },
      data: { proposalExpiresAt: new Date(Date.now() - 1000) },
    });
    const responses = await Promise.all([
      post(staff, clinicRoute(row.id, 'check-in'), { proposalVersion: 1 }),
      post(staff, clinicRoute(row.id, 'check-in'), { proposalVersion: 1 }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0].body as View).toMatchObject({
      status: 'CONFIRMED',
      proposalVersion: 2,
      proposalInitiator: null,
    });
    expect((responses[0].body as View).checkedInAt).not.toBeNull();
    await post(otherStaff, clinicRoute(row.id, 'check-in'), {
      proposalVersion: 1,
    }).expect(409);
    await post(owner, ownerRoute(row.id, 'cancel'), {
      proposalVersion: 2,
    }).expect(409);
    await post(owner, ownerRoute(row.id), proposal(2)).expect(409);
    await post(staff, clinicRoute(row.id, 'proposal'), proposal(2)).expect(409);
    await patch(staff, row.id, {
      status: 'COMPLETED',
      proposalVersion: 2,
    }).expect(409);
    await patch(staff, row.id, {
      status: 'CANCELLED',
      proposalVersion: 2,
      reason: 'The clinic must cancel after arrival.',
    }).expect(200);
    expect(
      await prisma.appointmentHistory.count({
        where: { appointmentId: row.id, action: 'CHECKED_IN' },
      }),
    ).toBe(1);
  });
  it('requires elapsed confirmed time, explicit version and note for terminal no-show; replays only the exact command', async () => {
    const future = await fixture();
    await patch(staff, future.id, {
      status: 'NO_SHOW',
      proposalVersion: 0,
      reason: 'Owner did not arrive.',
    }).expect(409);
    const row = await fixture('CONFIRMED', at(-1));
    await patch(staff, row.id, {
      status: 'NO_SHOW',
      reason: 'Owner did not arrive.',
    }).expect(400);
    await patch(staff, row.id, {
      status: 'NO_SHOW',
      proposalVersion: 0,
      reason: '  ',
    }).expect(400);
    const body = {
      status: 'NO_SHOW',
      proposalVersion: 0,
      reason: 'Owner did not arrive.',
    };
    const responses = await Promise.all([
      patch(staff, row.id, body),
      patch(staff, row.id, body),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(responses[0].body as View).toMatchObject({
      status: 'NO_SHOW',
      proposalVersion: 1,
      checkedInAt: null,
    });
    await patch(staff, row.id, {
      ...body,
      reason: 'A different no-show decision.',
    }).expect(409);
    await patch(staff, row.id, {
      status: 'COMPLETED',
      proposalVersion: 1,
    }).expect(409);
    await post(owner, ownerRoute(row.id, 'cancel'), {}).expect(409);
    expect(await sideEffects(row.id)).toEqual([1, 1, 1, 1]);
    const arrived = await fixture('CONFIRMED', at(-1));
    await post(staff, clinicRoute(arrived.id, 'check-in'), {
      proposalVersion: 0,
    }).expect(201);
    await patch(staff, arrived.id, { ...body, proposalVersion: 1 }).expect(409);
    await patch(staff, arrived.id, {
      status: 'COMPLETED',
      proposalVersion: 1,
    }).expect(200);
  });
  it('permits only one incompatible concurrent command and rejects stale versioned owner cancellation', async () => {
    const row = await fixture();
    await ownerRequest(row.id);
    const responses = await Promise.all([
      post(staff, clinicRoute(row.id, 'reschedule/accept'), {
        proposalVersion: 1,
      }),
      post(owner, ownerRoute(row.id, 'reschedule/withdraw'), {
        proposalVersion: 1,
      }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.appointmentHistory.count({
        where: {
          appointmentId: row.id,
          action: {
            in: ['OWNER_RESCHEDULE_ACCEPTED', 'OWNER_RESCHEDULE_WITHDRAWN'],
          },
        },
      }),
    ).toBe(1);
    await post(owner, ownerRoute(row.id, 'cancel'), {
      proposalVersion: 1,
    }).expect(409);
    const second = await fixture('CONFIRMED', at(-1));
    const race = await Promise.all([
      post(staff, clinicRoute(second.id, 'check-in'), { proposalVersion: 0 }),
      patch(staff, second.id, {
        status: 'NO_SHOW',
        proposalVersion: 0,
        reason: 'No arrival recorded.',
      }),
    ]);
    expect(race.filter((r) => r.status === 409)).toHaveLength(1);
    expect([200, 201]).toContain(race.find((r) => r.status !== 409)?.status);
  });
  it('rolls back checked-in state/history/event/audit when notification persistence fails', async () => {
    const row = await fixture();
    const notifications = app.get<NotificationsPublicApi>(
      NOTIFICATIONS_PUBLIC_API,
    );
    jest
      .spyOn(notifications, 'enqueue')
      .mockRejectedValueOnce(new Error('fixture persistence failure'));
    await expect(
      service.checkIn(
        staff.id,
        organizationId,
        row.id,
        { proposalVersion: 0 },
        randomUUID(),
      ),
    ).rejects.toThrow('fixture persistence failure');
    expect(
      await prisma.appointment.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      checkedInAt: null,
      proposalVersion: 0,
      status: 'CONFIRMED',
    });
    expect(await sideEffects(row.id)).toEqual([0, 0, 0, 0]);
  });
  it('revalidates the proposal deadline after waiting for clinic authorization locks', async () => {
    const row = await fixture();
    const organizations = app.get<OrganizationsPublicApi>(
      ORGANIZATIONS_PUBLIC_API,
    );
    const originalLock =
      organizations.lockAppointmentAccess.bind(organizations);
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      reached = resolve;
    });
    jest
      .spyOn(organizations, 'lockAppointmentAccess')
      .mockImplementationOnce(async (tx, accountId, clinicId) => {
        await originalLock(tx, accountId, clinicId);
        reached();
        await gate;
      });
    const input = {
      ...proposal(),
      expiresAt: new Date(Date.now() + 500).toISOString(),
    };
    const result = service
      .propose(staff.id, organizationId, row.id, input, randomUUID())
      .then(
        () => null,
        (error: unknown) => error,
      );
    await locked;
    await new Promise<void>((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, new Date(input.expiresAt).getTime() - Date.now()) + 20,
      ),
    );
    release();
    expect(await result).toMatchObject({ status: 409 });
    expect(await sideEffects(row.id)).toEqual([0, 0, 0, 0]);
    expect(
      await prisma.appointment.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ proposalVersion: 0, proposedStartsAt: null });
  });
  it('rechecks clinic transaction access even when staff is also the appointment requester', async () => {
    const row = await fixture();
    await prisma.organizationMembership.create({
      data: { organizationId, accountId: owner.id, role: 'STAFF' },
    });
    const organizations = app.get<OrganizationsPublicApi>(
      ORGANIZATIONS_PUBLIC_API,
    );
    const lock = jest.spyOn(organizations, 'lockAppointmentAccess');
    await patch(owner, row.id, {
      status: 'CANCELLED',
      proposalVersion: 0,
      reason: 'Clinic cancellation for my own booking.',
    }).expect(200);
    expect(lock).toHaveBeenCalledWith(
      expect.anything(),
      owner.id,
      organizationId,
    );
    await prisma.organizationMembership.deleteMany({
      where: { organizationId, accountId: owner.id },
    });
    const other = await fixture();
    await prisma.organization.update({
      where: { id: organizationId },
      data: { type: 'COMPANY' },
    });
    try {
      await request(http())
        .get(`/api/v1/appointments/organizations/${organizationId}`)
        .set('authorization', `Bearer ${staff.token}`)
        .expect(403);
      await post(staff, clinicRoute(other.id, 'check-in'), {
        proposalVersion: 0,
      }).expect(403);
    } finally {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { type: 'CLINIC' },
      });
    }
  });
});
