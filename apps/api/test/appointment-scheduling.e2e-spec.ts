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
import { SchedulingService } from '../src/modules/appointments/scheduling.service';
import { AuditService } from '../src/modules/audit/audit.service';
import {
  NOTIFICATIONS_PUBLIC_API,
  type NotificationsPublicApi,
} from '../src/modules/notifications/notifications.public';

type Actor = { id: string; token: string; petId: string };
type AppointmentView = {
  id: string;
  slotId: string;
  startsAt: string;
  status: string;
  proposalVersion: number;
  proposedSlotId: string | null;
  history: unknown[];
};
describe('Published clinic services, capacity and booking holds', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owners: Actor[];
  let admin: Actor;
  let staff: Actor;
  let recruiter: Actor;
  let organizationId: string;
  let otherOrganizationId: string;
  let serviceId: string;
  const accountIds: string[] = [];
  const requestIds: string[] = [];
  const resourceIds: string[] = [];
  const at = (hours: number) =>
    new Date(Date.now() + hours * 3600000).toISOString();
  const http = () => app.getHttpServer() as Parameters<typeof request>[0];
  const manage = (suffix = '') =>
    `/api/v1/scheduling/organizations/${organizationId}${suffix}`;
  const post = (actor: Actor, path: string, body: object) =>
    request(http())
      .post(path)
      .set('authorization', `Bearer ${actor.token}`)
      .send(body);
  const patch = (actor: Actor, path: string, body: object) =>
    request(http())
      .patch(path)
      .set('authorization', `Bearer ${actor.token}`)
      .send(body);
  async function slot(hours = 10, capacity = 1) {
    const id = randomUUID();
    resourceIds.push(id);
    return prisma.appointmentSlot.create({
      data: {
        id,
        serviceId,
        startsAt: new Date(at(hours)),
        endsAt: new Date(at(hours + 0.5)),
        timeZone: 'Asia/Dubai',
        capacity,
      },
    });
  }
  function hold(actor: Actor, slotId: string, id = randomUUID()) {
    return post(actor, `/api/v1/scheduling/clinics/${organizationId}/holds`, {
      id,
      slotId,
      petId: actor.petId,
    });
  }
  function body(
    actor: Actor,
    time: { id: string; startsAt: Date },
    holdId: string,
    requestId = randomUUID(),
  ) {
    requestIds.push(requestId);
    return {
      requestId,
      holdId,
      petId: actor.petId,
      organizationId,
      startsAt: time.startsAt.toISOString(),
      timeZone: 'Asia/Dubai',
      visitReason: 'Routine wellness check',
      sharingConsent: true,
    };
  }
  async function booked(
    actor = owners[0],
    time?: Awaited<ReturnType<typeof slot>>,
  ) {
    const value = time ?? (await slot());
    const held = await hold(actor, value.id).expect(201);
    const input = body(actor, value, (held.body as { id: string }).id);
    const result = await post(actor, '/api/v1/appointments', input).expect(201);
    return { time: value, input, appointment: result.body as AppointmentView };
  }
  async function confirm(appointment: AppointmentView) {
    const result = await patch(
      staff,
      `/api/v1/appointments/organizations/${organizationId}/${appointment.id}`,
      { status: 'CONFIRMED', proposalVersion: appointment.proposalVersion },
    ).expect(200);
    return result.body as AppointmentView;
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
    const tokens = app.get(AuthTokenService);
    async function actor(): Promise<Actor> {
      const account = await prisma.account.create({
        data: {
          email: `${randomUUID()}@scheduling.test`,
          passwordHash: 'no-fixture-login',
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
      const profile = await prisma.ownerProfile.create({
        data: {
          accountId: account.id,
          displayName: 'Scheduling Fixture Owner',
          countryCode: 'AE',
          phone: '+971500001234',
          pets: { create: { name: 'Luna', speciesCode: 'CAT' } },
        },
        include: { pets: true },
      });
      return {
        id: account.id,
        token: await tokens.signAccessToken({
          accountId: account.id,
          email: account.email,
          sessionFamilyId: familyId,
        }),
        petId: profile.pets[0].id,
      };
    }
    owners = await Promise.all([actor(), actor(), actor()]);
    admin = await actor();
    staff = await actor();
    recruiter = await actor();
    const organization = await prisma.organization.create({
      data: {
        legalName: 'Scheduling Fixture Clinic',
        status: 'VERIFIED',
        countryCode: 'AE',
        city: 'Dubai',
        phone: '+97140000000',
        acceptsAppointmentRequests: true,
        appointmentSchedulingEnabled: true,
        members: {
          create: [
            { accountId: admin.id, role: 'ADMIN' },
            { accountId: staff.id, role: 'STAFF' },
            { accountId: recruiter.id, role: 'RECRUITER' },
          ],
        },
      },
    });
    organizationId = organization.id;
    const other = await prisma.organization.create({
      data: {
        legalName: 'Other Scheduling Fixture',
        countryCode: 'AE',
        status: 'VERIFIED',
      },
    });
    otherOrganizationId = other.id;
  });
  beforeEach(async () => {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        status: 'VERIFIED',
        acceptsAppointmentRequests: true,
        appointmentSchedulingEnabled: true,
      },
    });
    await prisma.pet.updateMany({
      where: { id: { in: owners.map((owner) => owner.petId) } },
      data: { archivedAt: null },
    });
    const service = await prisma.clinicService.create({
      data: {
        organizationId,
        name: 'Wellness visit',
        description: 'Routine wellness appointment',
        durationMinutes: 30,
        active: true,
      },
    });
    serviceId = service.id;
    resourceIds.push(serviceId);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.notification.deleteMany({
      where: { resourceId: { in: requestIds } },
    });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: requestIds } },
    });
    await prisma.auditEvent.deleteMany({
      where: {
        resourceId: { in: [...requestIds, ...resourceIds, organizationId] },
      },
    });
    await prisma.appointmentHistory.deleteMany({
      where: { appointmentId: { in: requestIds } },
    });
    await prisma.appointment.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.clinicService.deleteMany({ where: { organizationId } });
    await prisma.clinicResource.deleteMany({
      where: { organizationId: { in: [organizationId, otherOrganizationId] } },
    });
    requestIds.length = 0;
    resourceIds.length = 0;
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.organization.deleteMany({
        where: {
          id: { in: [organizationId, otherOrganizationId].filter(Boolean) },
        },
      });
      await prisma.pet.deleteMany({
        where: { owner: { accountId: { in: accountIds } } },
      });
      await prisma.ownerProfile.deleteMany({
        where: { accountId: { in: accountIds } },
      });
      await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    await app?.close();
  });
  async function resource(name = `Room ${randomUUID()}`) {
    const id = randomUUID();
    resourceIds.push(id);
    await post(admin, manage('/resources'), { id, name, kind: 'ROOM' }).expect(
      201,
    );
    return id;
  }
  async function resourceSlot(
    resourceId: string,
    hours = 20,
    selectedServiceId = serviceId,
  ) {
    const id = randomUUID();
    resourceIds.push(id);
    const result = await post(admin, manage('/slots'), {
      id,
      serviceId: selectedServiceId,
      startsAt: at(hours),
      timeZone: 'Asia/Dubai',
      capacity: 1,
      resourceIds: [resourceId],
    }).expect(201);
    return result.body as {
      id: string;
      version: number;
      resourcesReserved: boolean;
      startsAt: string;
    };
  }
  async function secondService() {
    const value = await prisma.clinicService.create({
      data: {
        organizationId,
        name: 'Imaging',
        description: 'Diagnostic imaging appointment',
        durationMinutes: 30,
        active: true,
      },
    });
    resourceIds.push(value.id);
    return value.id;
  }

  it('scopes resource management and private assignment details to clinic roles', async () => {
    const id = await resource('Private consultation room');
    await post(staff, manage('/resources'), {
      id: randomUUID(),
      name: 'Staff room',
      kind: 'ROOM',
    }).expect(403);
    await patch(recruiter, manage(`/resources/${id}`), {
      version: 0,
      active: false,
    }).expect(403);
    const created = await resourceSlot(id);
    const managed = await request(http())
      .get(manage())
      .set('authorization', `Bearer ${staff.token}`)
      .expect(200);
    const managedBody = managed.body as {
      resources: unknown[];
      slots: { id: string; resources: { resourceId: string }[] }[];
    };
    expect(managedBody.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, name: 'Private consultation room' }),
      ]),
    );
    expect(
      managedBody.slots.find((item) => item.id === created.id)!.resources,
    ).toEqual([{ resourceId: id }]);
    const publicView = await request(http())
      .get(`/api/v1/scheduling/clinics/${organizationId}`)
      .expect(200);
    expect(
      (publicView.body as { resources?: unknown }).resources,
    ).toBeUndefined();
    expect(JSON.stringify(publicView.body)).not.toContain(id);
    expect(
      JSON.stringify((await hold(owners[0], created.id).expect(201)).body),
    ).not.toContain(id);
  });

  it('keeps exact resource retries single and validates names, kinds and assignments', async () => {
    const id = randomUUID();
    resourceIds.push(id);
    const input = { id, name: 'Ultrasound unit', kind: 'EQUIPMENT' };
    await post(admin, manage('/resources'), input).expect(201);
    await post(admin, manage('/resources'), input).expect(201);
    expect(await prisma.clinicResource.count({ where: { id } })).toBe(1);
    await post(admin, manage('/resources'), {
      ...input,
      name: 'Different name',
    }).expect(409);
    await post(admin, manage('/resources'), {
      ...input,
      id: randomUUID(),
      name: 'ultrasound UNIT',
    }).expect(409);
    await post(admin, manage('/resources'), {
      ...input,
      id: randomUUID(),
      kind: 'DOCTOR',
    }).expect(400);
    const foreign = await prisma.clinicResource.create({
      data: {
        organizationId: otherOrganizationId,
        name: 'Other room',
        kind: 'ROOM',
      },
    });
    const create = {
      id: randomUUID(),
      serviceId,
      startsAt: at(20),
      timeZone: 'Asia/Dubai',
      capacity: 1,
    };
    await post(admin, manage('/slots'), {
      ...create,
      resourceIds: [foreign.id],
    }).expect(409);
    await post(admin, manage('/slots'), {
      ...create,
      resourceIds: [id, id],
    }).expect(400);
    await post(admin, manage('/slots'), {
      ...create,
      resourceIds: Array.from({ length: 11 }, () => randomUUID()),
    }).expect(400);
  });

  it('serializes cross-service resource reservations and permits touching intervals', async () => {
    const id = await resource();
    const otherServiceId = await secondService();
    const startsAt = at(20);
    const ids = [randomUUID(), randomUUID()];
    resourceIds.push(...ids);
    const results = await Promise.all(
      [serviceId, otherServiceId].map((selected, index) =>
        post(admin, manage('/slots'), {
          id: ids[index],
          serviceId: selected,
          startsAt,
          timeZone: 'Asia/Dubai',
          capacity: 1,
          resourceIds: [id],
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const saved = results.find((result) => result.status === 201)!.body as {
      id: string;
      serviceId: string;
      endsAt: string;
    };
    const adjacent = randomUUID();
    resourceIds.push(adjacent);
    await post(admin, manage('/slots'), {
      id: adjacent,
      serviceId: saved.serviceId === serviceId ? otherServiceId : serviceId,
      startsAt: saved.endsAt,
      timeZone: 'Asia/Dubai',
      capacity: 1,
      resourceIds: [id],
    }).expect(201);
    const different = await resource();
    const independent = randomUUID();
    resourceIds.push(independent);
    await post(admin, manage('/slots'), {
      id: independent,
      serviceId: saved.serviceId === serviceId ? otherServiceId : serviceId,
      startsAt,
      timeZone: 'Asia/Dubai',
      capacity: 1,
      resourceIds: [different],
    }).expect(201);
  });

  it('closing preserves reservations; release requires no holds and reopening checks conflicts', async () => {
    const id = await resource();
    const other = await secondService();
    const time = await resourceSlot(id);
    const held = await hold(owners[0], time.id).expect(201);
    await patch(admin, manage(`/slots/${time.id}`), {
      version: 0,
      published: false,
      capacity: 1,
    }).expect(200);
    const nextId = randomUUID();
    resourceIds.push(nextId);
    const next = {
      id: nextId,
      serviceId: other,
      startsAt: time.startsAt,
      timeZone: 'Asia/Dubai',
      capacity: 1,
      resourceIds: [id],
    };
    await post(admin, manage('/slots'), next).expect(409);
    await patch(admin, manage(`/slots/${time.id}`), {
      version: 1,
      published: false,
      capacity: 1,
      releaseResources: true,
    }).expect(409);
    await post(
      owners[0],
      `/api/v1/scheduling/holds/${(held.body as { id: string }).id}/release`,
      {},
    ).expect(201);
    await patch(admin, manage(`/slots/${time.id}`), {
      version: 1,
      published: false,
      capacity: 1,
      releaseResources: true,
    }).expect(200);
    await post(admin, manage('/slots'), next).expect(201);
    await patch(admin, manage(`/slots/${time.id}`), {
      version: 2,
      published: true,
      capacity: 1,
    }).expect(409);
    expect(
      (
        await prisma.appointmentSlot.findUniqueOrThrow({
          where: { id: time.id },
        })
      ).resourcesReserved,
    ).toBe(false);
    await patch(admin, manage(`/slots/${nextId}`), {
      version: 0,
      published: false,
      capacity: 1,
      releaseResources: true,
    }).expect(200);
    await patch(admin, manage(`/slots/${time.id}`), {
      version: 2,
      published: true,
      capacity: 1,
    }).expect(200);
  });

  it('protects submitted appointments until cancellation before releasing and retiring resources', async () => {
    const id = await resource();
    const value = await resourceSlot(id);
    const held = await hold(owners[0], value.id).expect(201);
    const input = body(
      owners[0],
      { id: value.id, startsAt: new Date(value.startsAt) },
      (held.body as { id: string }).id,
    );
    const result = await post(owners[0], '/api/v1/appointments', input).expect(
      201,
    );
    const appointment = result.body as AppointmentView;
    await patch(admin, manage(`/slots/${value.id}`), {
      version: 0,
      published: false,
      capacity: 1,
      releaseResources: true,
    }).expect(409);
    await patch(admin, manage(`/resources/${id}`), {
      version: 0,
      active: false,
    }).expect(409);
    await post(owners[0], `/api/v1/appointments/${appointment.id}/cancel`, {
      proposalVersion: appointment.proposalVersion,
    }).expect(201);
    await patch(admin, manage(`/slots/${value.id}`), {
      version: 0,
      published: false,
      capacity: 1,
      releaseResources: true,
    }).expect(200);
    await patch(admin, manage(`/resources/${id}`), {
      version: 0,
      active: false,
    }).expect(200);
    await patch(admin, manage(`/slots/${value.id}`), {
      version: 1,
      published: true,
      capacity: 1,
    }).expect(409);
    await patch(admin, manage(`/resources/${id}`), {
      version: 0,
      active: true,
    }).expect(409);
    await patch(admin, manage(`/resources/${id}`), {
      version: 1,
      active: true,
    }).expect(200);
    await patch(admin, manage(`/slots/${value.id}`), {
      version: 1,
      published: true,
      capacity: 1,
    }).expect(200);
  });

  it('serializes closing/releasing with a competing owner hold without losing a reservation', async () => {
    const id = await resource();
    const value = await resourceSlot(id);
    const [released, held] = await Promise.all([
      patch(admin, manage(`/slots/${value.id}`), {
        version: 0,
        published: false,
        capacity: 1,
        releaseResources: true,
      }),
      hold(owners[0], value.id),
    ]);
    const saved = await prisma.appointmentSlot.findUniqueOrThrow({
      where: { id: value.id },
    });
    if (released.status === 200) {
      expect(held.status).toBe(409);
      expect(saved.resourcesReserved).toBe(false);
      expect(saved.published).toBe(false);
    } else {
      expect(released.status).toBe(409);
      expect(held.status).toBe(201);
      expect(saved.resourcesReserved).toBe(true);
      expect(saved.published).toBe(true);
    }
  });

  it('enforces the resource bound under concurrent creation and rejects published release', async () => {
    await prisma.clinicResource.createMany({
      data: Array.from({ length: 49 }, (_, index) => ({
        organizationId,
        name: `Bound ${index}`,
        kind: 'ROOM',
      })),
    });
    const ids = [randomUUID(), randomUUID()];
    resourceIds.push(...ids);
    const created = await Promise.all(
      ids.map((id, index) =>
        post(admin, manage('/resources'), {
          id,
          name: `Last ${index}`,
          kind: 'ROOM',
        }),
      ),
    );
    expect(created.map((item) => item.status).sort()).toEqual([201, 409]);
    const time = await resourceSlot(
      (created.find((item) => item.status === 201)!.body as { id: string }).id,
    );
    await patch(admin, manage(`/slots/${time.id}`), {
      version: 0,
      published: true,
      capacity: 1,
      releaseResources: true,
    }).expect(409);
  });

  it('rolls back resource creation and release when their durable audit fails', async () => {
    const id = randomUUID();
    resourceIds.push(id);
    jest
      .spyOn(app.get(AuditService), 'recordInTransaction')
      .mockRejectedValueOnce(new Error('Fixture audit failure'));
    await post(admin, manage('/resources'), {
      id,
      name: 'Rollback room',
      kind: 'ROOM',
    }).expect(500);
    expect(
      await prisma.clinicResource.findUnique({ where: { id } }),
    ).toBeNull();
    jest.restoreAllMocks();
    const resourceId = await resource();
    const time = await resourceSlot(resourceId);
    jest
      .spyOn(app.get(AuditService), 'recordInTransaction')
      .mockRejectedValueOnce(new Error('Fixture release audit failure'));
    await patch(admin, manage(`/slots/${time.id}`), {
      version: 0,
      published: false,
      capacity: 1,
      releaseResources: true,
    }).expect(500);
    expect(
      await prisma.appointmentSlot.findUniqueOrThrow({
        where: { id: time.id },
      }),
    ).toMatchObject({ published: true, resourcesReserved: true, version: 0 });
  });

  it('serializes competing owners for the last place and does not expose private owner details', async () => {
    const time = await slot();
    const results = await Promise.all([
      hold(owners[0], time.id),
      hold(owners[1], time.id),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const publicResult = await request(http())
      .get(`/api/v1/scheduling/clinics/${organizationId}`)
      .expect(200);
    expect(
      (publicResult.body as { slots: Array<{ remaining: number }> }).slots[0]
        .remaining,
    ).toBe(0);
    expect(JSON.stringify(publicResult.body)).not.toMatch(
      /accountId|petId|contactPhone|Scheduling Fixture Owner/,
    );
  });
  it('replays a hold without extending expiry and keeps one live hold per owner', async () => {
    const first = await slot(10);
    const second = await slot(11);
    const id = randomUUID();
    const created = await hold(owners[0], first.id, id).expect(201);
    const replay = await hold(owners[0], first.id, id).expect(201);
    expect((replay.body as { expiresAt: string }).expiresAt).toBe(
      (created.body as { expiresAt: string }).expiresAt,
    );
    await hold(owners[1], first.id, id).expect(409);
    await hold(owners[0], second.id).expect(201);
    expect(
      await prisma.bookingHold.count({
        where: {
          accountId: owners[0].id,
          releasedAt: null,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ).toBe(1);
    await hold(owners[1], first.id).expect(201);
  });

  it('serializes simultaneous holds on different slots for the same owner', async () => {
    const first = await slot(10);
    const second = await slot(11);
    const outcomes = await Promise.all([
      hold(owners[0], first.id),
      hold(owners[0], second.id),
    ]);
    expect(outcomes.map((result) => result.status)).toEqual([201, 201]);
    expect(
      await prisma.bookingHold.count({
        where: {
          accountId: owners[0].id,
          releasedAt: null,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ).toBe(1);
  });

  it('paginates availability beyond 200 times without leaking another clinic service', async () => {
    const start = new Date(at(2));
    const ids = Array.from({ length: 201 }, () => randomUUID());
    resourceIds.push(...ids);
    await prisma.appointmentSlot.createMany({
      data: ids.map((id, index) => ({
        id,
        serviceId,
        startsAt: new Date(start.getTime() + index * 3600000),
        endsAt: new Date(start.getTime() + index * 3600000 + 1800000),
        timeZone: 'Asia/Dubai',
      })),
    });
    const first = await request(http())
      .get(`/api/v1/scheduling/clinics/${organizationId}`)
      .expect(200);
    const page = first.body as {
      slots: Array<{ id: string }>;
      nextCursor: string;
    };
    expect(page.slots).toHaveLength(200);
    expect(page.nextCursor).toBeTruthy();
    const last = await request(http())
      .get(
        `/api/v1/scheduling/clinics/${organizationId}?cursor=${page.nextCursor}`,
      )
      .expect(200);
    expect(
      (last.body as { slots: Array<{ id: string }>; nextCursor: null }).slots,
    ).toHaveLength(1);
    expect((last.body as { nextCursor: null }).nextCursor).toBeNull();
    expect(
      new Set(
        [
          ...page.slots,
          ...(last.body as { slots: Array<{ id: string }> }).slots,
        ].map((item) => item.id),
      ).size,
    ).toBe(201);
  });
  it('atomically consumes a hold and replays concurrent identical appointment submissions once', async () => {
    const time = await slot();
    const held = await hold(owners[0], time.id).expect(201);
    const input = body(owners[0], time, (held.body as { id: string }).id);
    const [first, retry] = await Promise.all([
      post(owners[0], '/api/v1/appointments', input),
      post(owners[0], '/api/v1/appointments', input),
    ]);
    expect([first.status, retry.status]).toEqual([201, 201]);
    expect((first.body as AppointmentView).id).toBe(
      (retry.body as AppointmentView).id,
    );
    expect(await prisma.appointment.count({ where: { slotId: time.id } })).toBe(
      1,
    );
    expect(
      await prisma.appointmentHistory.count({
        where: { appointmentId: input.requestId },
      }),
    ).toBe(1);
    expect(first.body).toMatchObject({
      serviceName: 'Wellness visit',
      durationMinutes: 30,
      slotId: time.id,
    });
    await hold(owners[1], time.id).expect(409);
    await post(owners[0], '/api/v1/appointments', {
      ...input,
      visitReason: 'Different request contents',
    }).expect(409);
  });
  it('rejects expired holds, wrong pet/time, and free-form bypass while scheduling is enabled', async () => {
    const time = await slot();
    const held = await hold(owners[0], time.id).expect(201);
    const id = (held.body as { id: string }).id;
    const input = body(owners[0], time, id);
    await post(owners[0], '/api/v1/appointments', {
      ...input,
      startsAt: at(12),
    }).expect(409);
    await post(owners[1], '/api/v1/appointments', {
      ...input,
      requestId: randomUUID(),
      petId: owners[1].petId,
    }).expect(404);
    const { holdId: omitted, ...freeForm } = input;
    expect(omitted).toBe(id);
    await post(owners[0], '/api/v1/appointments', freeForm).expect(409);
    await prisma.bookingHold.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await post(owners[0], '/api/v1/appointments', input).expect(409);
    expect(
      await prisma.appointment.count({ where: { id: input.requestId } }),
    ).toBe(0);
    await hold(owners[1], time.id).expect(201);
  });
  it('releases capacity when an owner cancels or the clinic declines', async () => {
    const first = await booked();
    await post(
      owners[0],
      `/api/v1/appointments/${first.appointment.id}/cancel`,
      { proposalVersion: 0 },
    ).expect(201);
    const second = await booked(owners[1], first.time);
    await patch(
      staff,
      `/api/v1/appointments/organizations/${organizationId}/${second.appointment.id}`,
      {
        status: 'DECLINED',
        proposalVersion: 0,
        reason: 'Please select a different service',
      },
    ).expect(200);
    await hold(owners[2], first.time.id).expect(201);
  });
  it('restricts catalogue and settings changes to verified clinic owners/admins and protects scope', async () => {
    const input = {
      id: randomUUID(),
      name: 'Vaccination visit',
      description: 'Vaccination appointment',
      durationMinutes: 20,
    };
    resourceIds.push(input.id);
    await post(staff, manage('/services'), input).expect(403);
    await post(recruiter, manage('/services'), input).expect(403);
    await post(admin, manage('/services'), input).expect(201);
    await post(admin, manage('/services'), input).expect(201);
    await post(admin, manage('/slots'), {
      id: randomUUID(),
      serviceId: randomUUID(),
      startsAt: at(10),
      timeZone: 'Asia/Dubai',
      capacity: 1,
    }).expect(404);
    await patch(staff, manage(), {
      enabled: false,
      expectedEnabled: true,
    }).expect(403);
    await patch(admin, manage(), {
      enabled: false,
      expectedEnabled: true,
    }).expect(200);
    await patch(admin, manage(), {
      enabled: true,
      expectedEnabled: true,
    }).expect(409);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: 'SUSPENDED' },
    });
    await post(admin, manage('/services'), {
      ...input,
      id: randomUUID(),
    }).expect(403);
  });
  it('rejects overlapping times and capacity reductions below requests and active holds', async () => {
    const time = await slot();
    await hold(owners[0], time.id).expect(201);
    await patch(admin, manage(`/slots/${time.id}`), {
      version: 0,
      published: true,
      capacity: 2,
    }).expect(200);
    await hold(owners[1], time.id).expect(201);
    await patch(admin, manage(`/slots/${time.id}`), {
      version: 1,
      published: true,
      capacity: 1,
    }).expect(409);
    await post(admin, manage('/slots'), {
      id: randomUUID(),
      serviceId,
      startsAt: time.startsAt.toISOString(),
      timeZone: 'Asia/Dubai',
      capacity: 1,
    }).expect(409);
    await patch(admin, manage(`/slots/${time.id}`), {
      version: 0,
      published: false,
      capacity: 2,
    }).expect(409);
    await patch(admin, manage(`/slots/${time.id}`), {
      version: 1,
      published: false,
      capacity: 2,
    }).expect(200);
    await hold(owners[2], time.id).expect(409);
  });
  it('unpublishes services without rewriting booked snapshots and freezes duration after times exist', async () => {
    const result = await booked();
    await patch(admin, manage(`/services/${serviceId}`), {
      version: 0,
      active: true,
      name: 'Updated wellness name',
      durationMinutes: 45,
    }).expect(409);
    await patch(admin, manage(`/services/${serviceId}`), {
      version: 0,
      active: false,
      name: 'Updated wellness name',
    }).expect(200);
    const publicResult = await request(http())
      .get(`/api/v1/scheduling/clinics/${organizationId}`)
      .expect(200);
    expect(
      (publicResult.body as { services: unknown[]; slots: unknown[] }).services,
    ).toHaveLength(0);
    expect(
      (publicResult.body as { services: unknown[]; slots: unknown[] }).slots,
    ).toHaveLength(0);
    expect(
      await prisma.appointment.findUniqueOrThrow({
        where: { id: result.appointment.id },
      }),
    ).toMatchObject({ serviceName: 'Wellness visit', durationMinutes: 30 });
    await confirm(result.appointment);
  });
  it('retains the original reservation when a proposed time fills before acceptance', async () => {
    const initial = await booked();
    const confirmed = await confirm(initial.appointment);
    const target = await slot(12);
    const input = {
      slotId: target.id,
      startsAt: target.startsAt.toISOString(),
      timeZone: target.timeZone,
      expiresAt: at(1),
      proposalVersion: confirmed.proposalVersion,
      reason: 'Please use the later published time',
    };
    const pending = await post(
      owners[0],
      `/api/v1/appointments/${confirmed.id}/reschedule`,
      input,
    ).expect(201);
    expect(pending.body).toMatchObject({
      slotId: initial.time.id,
      proposedSlotId: target.id,
    });
    await booked(owners[1], target);
    await post(
      staff,
      `/api/v1/appointments/organizations/${organizationId}/${confirmed.id}/reschedule/accept`,
      { proposalVersion: confirmed.proposalVersion + 1 },
    ).expect(409);
    expect(
      await prisma.appointment.findUniqueOrThrow({
        where: { id: confirmed.id },
      }),
    ).toMatchObject({
      slotId: initial.time.id,
      startsAt: initial.time.startsAt,
      status: 'CONFIRMED',
    });
    await hold(owners[2], initial.time.id).expect(409);
    await post(
      owners[0],
      `/api/v1/appointments/${confirmed.id}/reschedule/withdraw`,
      { proposalVersion: confirmed.proposalVersion + 1 },
    ).expect(201);
  });
  it('moves a reservation on acceptance, releases the old place, and forbids free-form rescheduling', async () => {
    const initial = await booked();
    const confirmed = await confirm(initial.appointment);
    const target = await slot(12);
    const input = {
      slotId: target.id,
      startsAt: target.startsAt.toISOString(),
      timeZone: target.timeZone,
      expiresAt: at(1),
      proposalVersion: confirmed.proposalVersion,
      reason: 'Clinic suggested another published time',
    };
    const { slotId: omitted, ...freeForm } = input;
    expect(omitted).toBe(target.id);
    await post(
      staff,
      `/api/v1/appointments/organizations/${organizationId}/${confirmed.id}/proposal`,
      freeForm,
    ).expect(400);
    await post(
      staff,
      `/api/v1/appointments/organizations/${organizationId}/${confirmed.id}/proposal`,
      input,
    ).expect(201);
    await post(
      owners[0],
      `/api/v1/appointments/${confirmed.id}/proposal/accept`,
      { proposalVersion: confirmed.proposalVersion + 1 },
    ).expect(201);
    expect(
      await prisma.appointment.findUniqueOrThrow({
        where: { id: confirmed.id },
      }),
    ).toMatchObject({ slotId: target.id, proposedSlotId: null });
    await hold(owners[1], initial.time.id).expect(201);
    await hold(owners[2], target.id).expect(409);
  });
  it('rechecks clinic intake and pet archival after a hold was obtained', async () => {
    const time = await slot();
    const held = await hold(owners[0], time.id).expect(201);
    const input = body(owners[0], time, (held.body as { id: string }).id);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { acceptsAppointmentRequests: false },
    });
    await post(owners[0], '/api/v1/appointments', input).expect(409);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { acceptsAppointmentRequests: true },
    });
    await prisma.pet.update({
      where: { id: owners[0].petId },
      data: { archivedAt: new Date() },
    });
    await post(owners[0], '/api/v1/appointments', input).expect(404);
    expect(
      await prisma.appointment.count({ where: { id: input.requestId } }),
    ).toBe(0);
  });
  it('rolls back hold consumption when transactional notification persistence fails', async () => {
    const time = await slot();
    const held = await hold(owners[0], time.id).expect(201);
    const id = (held.body as { id: string }).id;
    const input = body(owners[0], time, id);
    jest
      .spyOn(
        app.get<NotificationsPublicApi>(NOTIFICATIONS_PUBLIC_API),
        'enqueue',
      )
      .mockRejectedValueOnce(new Error('fixture notification failure'));
    await post(owners[0], '/api/v1/appointments', input).expect(500);
    expect(
      await prisma.bookingHold.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ consumedAt: null });
    expect(
      await prisma.appointment.count({ where: { id: input.requestId } }),
    ).toBe(0);
    await post(owners[0], '/api/v1/appointments', input).expect(201);
  });
  it('allows existing owners to find alternatives after intake stops, while rejecting unrelated callers', async () => {
    const result = await booked();
    await slot(12);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { acceptsAppointmentRequests: false },
    });
    await request(http())
      .get(`/api/v1/scheduling/clinics/${organizationId}`)
      .expect(404);
    await request(http())
      .get(
        `/api/v1/scheduling/appointments/${result.appointment.id}/alternatives`,
      )
      .set('authorization', `Bearer ${owners[0].token}`)
      .expect(200);
    await request(http())
      .get(
        `/api/v1/scheduling/appointments/${result.appointment.id}/alternatives`,
      )
      .set('authorization', `Bearer ${owners[1].token}`)
      .expect(403);
    const listing = await app
      .get(SchedulingService)
      .alternatives(owners[0].id, result.appointment.id);
    expect(listing.slots).toHaveLength(2);
  });
});
