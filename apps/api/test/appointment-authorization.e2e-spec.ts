import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import type { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/platform/persistence/prisma.service';
import { AppointmentsService } from '../src/modules/appointments/appointments.service';
import {
  ORGANIZATIONS_PUBLIC_API,
  type OrganizationsPublicApi,
} from '../src/modules/organizations/organizations.public';
import { NOTIFICATIONS_PUBLIC_API } from '../src/modules/notifications/notifications.public';

function barrier<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((ready) => {
    resolve = ready;
  });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out: ${label}`)),
          5_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function outcome<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );
}

describe('Clinic command permission transaction boundary', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let organizations: OrganizationsPublicApi;
  let appointments: AppointmentsService;
  let staffId: string;
  let ownerId: string;
  let organizationId: string;
  let ownerProfileId: string;
  let petId: string;
  const appointmentIds: string[] = [];
  const memberWhere = () => ({
    organizationId_accountId: { organizationId, accountId: staffId },
  });
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATIONS_PUBLIC_API)
      .useValue({
        enqueue: () => Promise.resolve(),
        enqueueEmail: () => Promise.resolve(),
      })
      .compile();
    app = fixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    organizations = app.get(ORGANIZATIONS_PUBLIC_API);
    appointments = app.get(AppointmentsService);
    async function account(label: string) {
      return prisma.account.create({
        data: {
          email: `${label}-${randomUUID()}@appointment-authorization.test`,
          passwordHash: 'non-login-integration-fixture',
          status: 'ACTIVE',
        },
      });
    }
    staffId = (await account('staff')).id;
    ownerId = (await account('owner')).id;
    organizationId = (
      await prisma.organization.create({
        data: {
          legalName: 'Authorization fixture clinic',
          countryCode: 'AE',
          type: 'CLINIC',
          status: 'VERIFIED',
          members: { create: { accountId: staffId, role: 'STAFF' } },
        },
      })
    ).id;
    const owner = await prisma.ownerProfile.create({
      data: {
        accountId: ownerId,
        displayName: 'Fixture owner',
        countryCode: 'AE',
        phone: '+971500000000',
        pets: { create: { name: 'Luna', speciesCode: 'CAT', sex: 'FEMALE' } },
      },
      include: { pets: true },
    });
    ownerProfileId = owner.id;
    petId = owner.pets[0].id;
  });
  beforeEach(async () => {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: 'VERIFIED', type: 'CLINIC' },
    });
    await prisma.organizationMembership.upsert({
      where: memberWhere(),
      create: { organizationId, accountId: staffId, role: 'STAFF' },
      update: { role: 'STAFF' },
    });
  });
  async function appointment() {
    const saved = await prisma.appointment.create({
      data: {
        requesterAccountId: ownerId,
        ownerProfileId,
        petId,
        organizationId,
        ownerName: 'Fixture owner',
        contactPhone: '+971500000000',
        petName: 'Luna',
        speciesCode: 'CAT',
        clinicName: 'Authorization fixture clinic',
        startsAt: new Date(Date.now() + 86400000),
        timeZone: 'Asia/Dubai',
        visitReason: 'Routine visit',
        sharingConsentAt: new Date(),
      },
    });
    appointmentIds.push(saved.id);
    return saved;
  }
  async function unchanged(id: string) {
    expect(
      (await prisma.appointment.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('REQUESTED');
    expect(
      await prisma.appointmentHistory.count({ where: { appointmentId: id } }),
    ).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: id } })).toBe(
      0,
    );
    expect(await prisma.auditEvent.count({ where: { resourceId: id } })).toBe(
      0,
    );
  }

  it('allows existing clinic care grants and rejects absent, recruiter, unverified or non-clinic grants', async () => {
    for (const role of ['OWNER', 'ADMIN', 'STAFF'] as const) {
      await prisma.organizationMembership.update({
        where: memberWhere(),
        data: { role },
      });
      await prisma.$transaction((tx) =>
        organizations.lockAppointmentAccess(tx, staffId, organizationId),
      );
    }
    await prisma.organizationMembership.update({
      where: memberWhere(),
      data: { role: 'RECRUITER' },
    });
    await expect(
      prisma.$transaction((tx) =>
        organizations.lockAppointmentAccess(tx, staffId, organizationId),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await prisma.organizationMembership.update({
      where: memberWhere(),
      data: { role: 'STAFF' },
    });
    for (const data of [
      { status: 'SUSPENDED' as const },
      { status: 'VERIFIED' as const, type: 'COMPANY' as const },
    ]) {
      await prisma.organization.update({ where: { id: organizationId }, data });
      await expect(
        prisma.$transaction((tx) =>
          organizations.lockAppointmentAccess(tx, staffId, organizationId),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    await prisma.organization.update({
      where: { id: organizationId },
      data: { type: 'HOSPITAL', status: 'VERIFIED' },
    });
    await prisma.$transaction((tx) =>
      organizations.lockAppointmentAccess(tx, staffId, organizationId),
    );
    await prisma.organizationMembership.delete({ where: memberWhere() });
    await expect(
      prisma.$transaction((tx) =>
        organizations.lockAppointmentAccess(tx, staffId, organizationId),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['membership', 'organization'] as const)(
    'rejects a command when %s revocation acquires its lock first without recording effects',
    async (target) => {
      const requested = await appointment();
      const revocationReady = barrier();
      const releaseRevocation = barrier();
      const commandEntered = barrier();
      const original = organizations.lockAppointmentAccess.bind(organizations);
      const spy = jest
        .spyOn(organizations, 'lockAppointmentAccess')
        .mockImplementation(async (...args) => {
          commandEntered.resolve();
          await original(...args);
        });
      const revocation = outcome(
        prisma.$transaction(
          async (tx) => {
            if (target === 'membership')
              await tx.organizationMembership.delete({ where: memberWhere() });
            else
              await tx.organization.update({
                where: { id: organizationId },
                data: { status: 'SUSPENDED' },
              });
            revocationReady.resolve();
            await bounded(
              releaseRevocation.promise,
              'release permission revocation',
            );
          },
          { timeout: 15_000 },
        ),
      );
      let command: ReturnType<typeof outcome<unknown>> | undefined;
      try {
        await bounded(revocationReady.promise, 'revocation holds row lock');
        command = outcome(
          appointments.decide(
            staffId,
            organizationId,
            requested.id,
            { status: 'CONFIRMED' },
            randomUUID(),
          ),
        );
        await bounded(
          commandEntered.promise,
          'command reaches transactional permission port',
        );
        releaseRevocation.resolve();
        expect(
          (await bounded(revocation, 'revocation commits')).error,
        ).toBeUndefined();
        expect(
          (await bounded(command, 'command rejected')).error,
        ).toBeInstanceOf(ForbiddenException);
        await unchanged(requested.id);
      } finally {
        releaseRevocation.resolve();
        await revocation;
        if (command) await command;
        spy.mockRestore();
      }
    },
    20_000,
  );

  async function blocked(pid: number) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<
        Array<{ blocked: boolean }>
      >`SELECT cardinality(pg_blocking_pids(${pid}::integer)) > 0 AS blocked`;
      if (rows[0]?.blocked) return;
    }
    throw new Error(
      'Revocation did not wait for the admitted command row lock',
    );
  }
  it.each(['membership', 'organization'] as const)(
    'holds admitted %s authority through commit and blocks subsequent revocation',
    async (target) => {
      const requested = await appointment();
      const admitted = barrier();
      const releaseCommand = barrier();
      const revokerPid = barrier<number>();
      const original = organizations.lockAppointmentAccess.bind(organizations);
      const spy = jest
        .spyOn(organizations, 'lockAppointmentAccess')
        .mockImplementation(async (...args) => {
          await original(...args);
          admitted.resolve();
          await bounded(releaseCommand.promise, 'release admitted command');
        });
      const command = outcome(
        appointments.decide(
          staffId,
          organizationId,
          requested.id,
          { status: 'CONFIRMED' },
          randomUUID(),
        ),
      );
      let revocation: ReturnType<typeof outcome<void>> | undefined;
      let revocationCommitted = false;
      try {
        await bounded(admitted.promise, 'command permission admitted');
        revocation = outcome(
          prisma
            .$transaction(
              async (tx: Prisma.TransactionClient) => {
                const rows = await tx.$queryRaw<
                  Array<{ pid: number }>
                >`SELECT pg_backend_pid() AS pid`;
                revokerPid.resolve(rows[0].pid);
                if (target === 'membership')
                  await tx.organizationMembership.delete({
                    where: memberWhere(),
                  });
                else
                  await tx.organization.update({
                    where: { id: organizationId },
                    data: { status: 'SUSPENDED' },
                  });
              },
              { timeout: 15_000 },
            )
            .then(() => {
              revocationCommitted = true;
            }),
        );
        await blocked(
          await bounded(revokerPid.promise, 'revocation transaction starts'),
        );
        expect(revocationCommitted).toBe(false);
        releaseCommand.resolve();
        const result = await bounded(command, 'admitted command commits');
        expect(result.error).toBeUndefined();
        expect(result.value?.status).toBe('CONFIRMED');
        expect(
          (await bounded(revocation, 'revocation commits after command')).error,
        ).toBeUndefined();
        expect(
          await prisma.appointmentHistory.count({
            where: { appointmentId: requested.id },
          }),
        ).toBe(1);
        expect(
          await prisma.outboxEvent.count({
            where: { aggregateId: requested.id },
          }),
        ).toBe(1);
      } finally {
        releaseCommand.resolve();
        await command;
        if (revocation) await revocation;
        spy.mockRestore();
      }
    },
    20_000,
  );

  afterAll(async () => {
    if (prisma) {
      await prisma.appointmentReminder.deleteMany({
        where: { appointmentId: { in: appointmentIds } },
      });
      await prisma.appointmentHistory.deleteMany({
        where: { appointmentId: { in: appointmentIds } },
      });
      await prisma.appointment.deleteMany({
        where: { id: { in: appointmentIds } },
      });
      await prisma.notification.deleteMany({
        where: {
          recipientAccountId: { in: [staffId, ownerId].filter(Boolean) },
        },
      });
      if (petId) await prisma.pet.deleteMany({ where: { id: petId } });
      if (ownerProfileId)
        await prisma.ownerProfile.deleteMany({ where: { id: ownerProfileId } });
      if (organizationId)
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.account.deleteMany({
        where: { id: { in: [staffId, ownerId].filter(Boolean) } },
      });
      await prisma.auditEvent.deleteMany({
        where: { actorId: { in: [staffId, ownerId].filter(Boolean) } },
      });
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: appointmentIds } },
      });
    }
    await app?.close();
  });
});
