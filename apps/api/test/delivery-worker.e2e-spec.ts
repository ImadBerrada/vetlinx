import { ConfigService } from '@nestjs/config';
import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthTokenService } from '../src/modules/identity/auth-token.service';
import { WorkerModule } from '../src/platform/delivery/worker.module';
import { DeliveryWorkerService } from '../src/platform/delivery/delivery-worker.service';
import { MailQueueService } from '../src/platform/delivery/mail-queue.service';
import { MailTransportService } from '../src/platform/delivery/mail-transport.service';
import { PrismaService } from '../src/platform/persistence/prisma.service';
import { AppointmentRemindersService } from '../src/modules/appointments/appointment-reminders.service';
import {
  NOTIFICATIONS_PUBLIC_API,
  type NotificationsPublicApi,
} from '../src/modules/notifications/notifications.public';
import { validateEnvironment } from '../src/platform/config/environment';

// This suite intentionally uses its own migrated database: the worker scans whole queues.
// Never replace this with the shared browser/API database or real SMTP transport.
const workerDatabase = process.env.WORKER_TEST_DATABASE_URL;
if (
  workerDatabase &&
  new URL(workerDatabase).pathname !== '/vetlinx_worker_test'
) {
  throw new Error(
    'Delivery tests require the dedicated vetlinx_worker_test database',
  );
}
const describeWorker = workerDatabase ? describe : describe.skip;
describeWorker(
  'Delivery worker with an isolated PostgreSQL database (WORKER_TEST_DATABASE_URL)',
  () => {
    let module: TestingModule;
    let app: INestApplication;
    let prisma: PrismaService;
    let worker: DeliveryWorkerService;
    let queue: MailQueueService;
    let reminders: AppointmentRemindersService;
    let notifications: NotificationsPublicApi;
    const send = jest.fn<
      Promise<void>,
      [{ id: string; to: string; subject: string; text: string }]
    >();
    const past = () => new Date(Date.now() - 60000);
    const future = () => new Date(Date.now() + 3600000);

    async function resetFixtures() {
      await prisma.emailDelivery.deleteMany();
      await prisma.eventDelivery.deleteMany();
      await prisma.outboxEvent.deleteMany();
      await prisma.notification.deleteMany();
      await prisma.workerHeartbeat.deleteMany();
      await prisma.appointmentHistory.deleteMany();
      await prisma.appointment.deleteMany();
      await prisma.pet.deleteMany();
      await prisma.ownerProfile.deleteMany();
      await prisma.organizationMembership.deleteMany();
      await prisma.organization.deleteMany();
      await prisma.auditEvent.deleteMany();
      await prisma.account.deleteMany();
    }
    async function enqueue(
      key = `fixture:${randomUUID()}`,
      options: { expiresAt?: Date; text?: string } = {},
    ) {
      await prisma.$transaction((tx) =>
        queue.enqueue(tx, {
          idempotencyKey: key,
          to: 'recipient@worker.test',
          subject: 'Fixture message',
          text: options.text ?? 'Private recovery token: fixture-secret',
          sensitive: true,
          expiresAt: options.expiresAt,
        }),
      );
      return prisma.emailDelivery.findUniqueOrThrow({
        where: { idempotencyKey: key },
      });
    }
    async function resourceEvent(name = 'AppointmentRequested', version = 1) {
      const event = await prisma.outboxEvent.create({
        data: {
          id: randomUUID(),
          name,
          version,
          aggregateId: randomUUID(),
          correlationId: randomUUID(),
          payload: {},
          occurredAt: past(),
        },
      });
      return event;
    }
    async function recipient(verified = true) {
      return prisma.account.create({
        data: {
          email: `${randomUUID()}@worker.test`,
          passwordHash: 'no-password-login-fixture',
          status: 'ACTIVE',
          emailVerifiedAt: verified ? new Date() : null,
        },
      });
    }
    async function appointment() {
      const owner = await recipient();
      const profile = await prisma.ownerProfile.create({
        data: {
          accountId: owner.id,
          displayName: 'Private Owner Name',
          countryCode: 'AE',
          phone: '+971501234567',
          pets: {
            create: {
              name: 'Private Pet Name',
              speciesCode: 'CAT',
              sex: 'FEMALE',
            },
          },
        },
        include: { pets: true },
      });
      const clinic = await prisma.organization.create({
        data: {
          legalName: 'Worker Fixture Clinic',
          countryCode: 'AE',
          type: 'CLINIC',
          status: 'VERIFIED',
        },
      });
      return prisma.appointment.create({
        data: {
          requesterAccountId: owner.id,
          ownerProfileId: profile.id,
          petId: profile.pets[0].id,
          organizationId: clinic.id,
          ownerName: profile.displayName,
          contactPhone: profile.phone,
          petName: profile.pets[0].name,
          speciesCode: 'CAT',
          clinicName: clinic.legalName,
          startsAt: future(),
          timeZone: 'Asia/Dubai',
          visitReason: 'Private clinical visit details',
          sharingConsentAt: new Date(),
          status: 'CONFIRMED',
        },
      });
    }

    async function principal(operations = false) {
      const account = await recipient();
      if (operations)
        await prisma.accountSystemRole.create({
          data: {
            accountId: account.id,
            role: 'OPERATIONS_ADMIN',
            grantedBy: 'worker-integration-fixture',
          },
        });
      const tokens = module.get(AuthTokenService);
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
      return tokens.signAccessToken({
        accountId: account.id,
        email: account.email,
        sessionFamilyId: familyId,
      });
    }

    beforeAll(async () => {
      // Destructive fixture cleanup is restricted to this explicitly named disposable database.
      if (
        !workerDatabase ||
        new URL(workerDatabase).pathname !== '/vetlinx_worker_test'
      )
        throw new Error(
          'Worker integration tests require the isolated vetlinx_worker_test database',
        );
      const config = new ConfigService({
        ...validateEnvironment(process.env),
        DATABASE_URL: workerDatabase,
        DELIVERY_ENCRYPTION_KEY: 'c3'.repeat(32),
      });
      module = await Test.createTestingModule({ imports: [WorkerModule] })
        .overrideProvider(ConfigService)
        .useValue(config)
        .overrideProvider(MailTransportService)
        .useValue({ send })
        .compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api');
      app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
      await app.init();
      prisma = module.get(PrismaService);
      worker = module.get(DeliveryWorkerService);
      queue = module.get(MailQueueService);
      reminders = module.get(AppointmentRemindersService);
      notifications = module.get<NotificationsPublicApi>(
        NOTIFICATIONS_PUBLIC_API,
      );
      await resetFixtures();
    });
    beforeEach(() => {
      send.mockReset().mockResolvedValue(undefined);
    });
    afterEach(async () => {
      jest.restoreAllMocks();
      if (prisma) await resetFixtures();
    });
    afterAll(async () => {
      await app?.close();
    });

    it('resolves the real worker module and encrypts durable queue content with idempotent insertion', async () => {
      expect(worker).toBeInstanceOf(DeliveryWorkerService);
      const key = `fixture:${randomUUID()}`;
      const first = await enqueue(key);
      await enqueue(key, {
        text: 'A later duplicate must not overwrite the original',
      });
      const row = await prisma.emailDelivery.findUniqueOrThrow({
        where: { idempotencyKey: key },
      });
      expect(row.id).toBe(first.id);
      expect(await prisma.emailDelivery.count()).toBe(1);
      expect(row.encryptedText).not.toContain('fixture-secret');
      expect(queue.decrypt(row.encryptedText!)).toBe(
        'Private recovery token: fixture-secret',
      );
      await expect(
        prisma.$transaction(async (tx) => {
          await queue.enqueue(tx, {
            idempotencyKey: 'fixture:rollback',
            to: 'recipient@worker.test',
            subject: 'Rollback',
            text: 'Must not persist',
            sensitive: true,
          });
          throw new Error('Rollback fixture');
        }),
      ).rejects.toThrow('Rollback fixture');
      expect(await prisma.emailDelivery.count()).toBe(1);
    });

    it('bounds expired booking-hold cleanup and preserves booked snapshots and recent holds', async () => {
      const booked = await appointment();
      const service = await prisma.clinicService.create({
        data: {
          organizationId: booked.organizationId,
          name: 'Worker service',
          description: 'Worker fixture',
          durationMinutes: 30,
          active: true,
        },
      });
      const slot = await prisma.appointmentSlot.create({
        data: {
          serviceId: service.id,
          startsAt: future(),
          endsAt: new Date(Date.now() + 5400000),
          timeZone: 'Asia/Dubai',
          capacity: 10,
        },
      });
      const consumedId = randomUUID();
      const now = new Date();
      await prisma.bookingHold.createMany({
        data: Array.from({ length: 1001 }, (_, index) => ({
          id: index === 0 ? consumedId : randomUUID(),
          slotId: slot.id,
          accountId: booked.requesterAccountId,
          petId: booked.petId,
          expiresAt: new Date(
            now.getTime() - (index === 0 ? 48 : 25) * 3600000,
          ),
          ...(index === 0
            ? { consumedAt: new Date(now.getTime() - 49 * 3600000) }
            : {}),
        })),
      });
      await prisma.bookingHold.createMany({
        data: [
          new Date(now.getTime() - 60000),
          new Date(now.getTime() + 300000),
        ].map((expiresAt) => ({
          id: randomUUID(),
          slotId: slot.id,
          accountId: booked.requesterAccountId,
          petId: booked.petId,
          expiresAt,
        })),
      });
      await prisma.appointment.update({
        where: { id: booked.id },
        data: {
          slotId: slot.id,
          requestHoldId: consumedId,
          serviceName: service.name,
          durationMinutes: 30,
        },
      });
      await prisma.appointmentHistory.create({
        data: {
          appointmentId: booked.id,
          actorAccountId: booked.requesterAccountId,
          toStatus: 'REQUESTED',
          action: 'REQUESTED',
          slotId: slot.id,
          proposedStartsAt: booked.startsAt,
          proposedTimeZone: booked.timeZone,
        },
      });
      await worker.tick();
      expect(await prisma.bookingHold.count()).toBe(3);
      expect(
        await prisma.bookingHold.findUnique({ where: { id: consumedId } }),
      ).toBeNull();
      expect(
        await prisma.appointment.findUniqueOrThrow({
          where: { id: booked.id },
        }),
      ).toMatchObject({
        requestHoldId: consumedId,
        serviceName: service.name,
        slotId: slot.id,
      });
      expect(
        await prisma.appointmentHistory.count({
          where: { appointmentId: booked.id },
        }),
      ).toBe(1);
      await worker.tick();
      expect(await prisma.bookingHold.count()).toBe(2);
    });

    it('leases queued mail so overlapping workers do not send the same active job twice', async () => {
      const row = await enqueue();
      let release!: () => void;
      let started!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      send.mockImplementationOnce(() => {
        started();
        return gate;
      });
      const first = worker.dispatchEmail();
      await entered;
      await worker.dispatchEmail();
      expect(send).toHaveBeenCalledTimes(1);
      release();
      await first;
      const delivered = await prisma.emailDelivery.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(delivered).toMatchObject({
        state: 'DELIVERED',
        attempts: 1,
        encryptedText: null,
        leaseId: null,
        leasedUntil: null,
        lastError: null,
      });
      expect(delivered.sentAt).not.toBeNull();
    });

    it('retries failed mail after backoff while recording only a safe error code', async () => {
      const row = await enqueue();
      send.mockRejectedValueOnce(
        new Error(
          'SMTP credentials and private fixture-secret must not reach persisted errors',
        ),
      );
      await worker.dispatchEmail();
      const failed = await prisma.emailDelivery.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(failed).toMatchObject({
        state: 'PENDING',
        attempts: 1,
        lastError: 'MAIL_DELIVERY_FAILED',
        leaseId: null,
        leasedUntil: null,
      });
      expect(failed.availableAt.getTime()).toBeGreaterThan(Date.now());
      await worker.dispatchEmail();
      expect(send).toHaveBeenCalledTimes(1);
      await prisma.emailDelivery.update({
        where: { id: row.id },
        data: { availableAt: past() },
      });
      await worker.dispatchEmail();
      expect(send).toHaveBeenCalledTimes(2);
      expect(
        await prisma.emailDelivery.findUniqueOrThrow({ where: { id: row.id } }),
      ).toMatchObject({ state: 'DELIVERED', attempts: 2, encryptedText: null });
    });

    it('dead-letters mail after five failures and excludes it from further attempts', async () => {
      const row = await enqueue();
      send.mockRejectedValue(new Error('Fixture SMTP unavailable'));
      for (let attempt = 1; attempt <= 5; attempt++) {
        await prisma.emailDelivery.update({
          where: { id: row.id },
          data: { availableAt: past() },
        });
        await worker.dispatchEmail();
        expect(
          await prisma.emailDelivery.findUniqueOrThrow({
            where: { id: row.id },
          }),
        ).toMatchObject({
          attempts: attempt,
          state: attempt === 5 ? 'FAILED' : 'PENDING',
        });
      }
      await worker.dispatchEmail();
      expect(send).toHaveBeenCalledTimes(5);
    });

    it('recovers an abandoned email lease and drops expired sensitive content without sending it', async () => {
      const abandoned = await enqueue();
      await prisma.emailDelivery.update({
        where: { id: abandoned.id },
        data: {
          state: 'PROCESSING',
          attempts: 1,
          leaseId: randomUUID(),
          leasedUntil: past(),
        },
      });
      const expired = await enqueue(undefined, { expiresAt: past() });
      await worker.dispatchEmail();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].id).toBe(abandoned.id);
      expect(
        await prisma.emailDelivery.findUniqueOrThrow({
          where: { id: abandoned.id },
        }),
      ).toMatchObject({ state: 'DELIVERED', attempts: 2 });
      expect(
        await prisma.emailDelivery.findUniqueOrThrow({
          where: { id: expired.id },
        }),
      ).toMatchObject({
        state: 'CANCELLED',
        encryptedText: null,
        leaseId: null,
      });
    });

    it('fans out supported events only to verified active contacts and leaves unsupported events untouched', async () => {
      const verified = await recipient();
      const unverified = await recipient(false);
      const suspended = await recipient();
      await prisma.account.update({
        where: { id: suspended.id },
        data: { status: 'SUSPENDED' },
      });
      const event = await resourceEvent();
      const unsupported = await resourceEvent('FutureDomainEvent');
      const futureVersion = await resourceEvent('AppointmentRequested', 99);
      await prisma.notification.createMany({
        data: [verified, unverified, suspended].map((account) => ({
          recipientAccountId: account.id,
          kind: 'APPOINTMENT_REQUESTED',
          title: 'Private Pet Name',
          message: 'Private clinical visit details',
          resourceType: 'appointment',
          resourceId: event.aggregateId,
        })),
      });
      await worker.dispatchEvents();
      expect(
        await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
      ).toMatchObject({ status: 'PUBLISHED', attempts: 1 });
      expect(
        await prisma.eventDelivery.findUniqueOrThrow({
          where: { eventId: event.id },
        }),
      ).toMatchObject({ state: 'DELIVERED', attempts: 1 });
      expect(await prisma.emailDelivery.count()).toBe(1);
      const email = await prisma.emailDelivery.findFirstOrThrow();
      expect(email.to).toBe(verified.email);
      expect(queue.decrypt(email.encryptedText!)).not.toMatch(
        /Private Pet Name|Private clinical visit details/,
      );
      await worker.dispatchEvents();
      expect(await prisma.emailDelivery.count()).toBe(1);
      for (const untouched of [unsupported, futureVersion]) {
        expect(
          await prisma.outboxEvent.findUniqueOrThrow({
            where: { id: untouched.id },
          }),
        ).toMatchObject({ status: 'PENDING', attempts: 0, publishedAt: null });
        expect(
          await prisma.eventDelivery.count({
            where: { eventId: untouched.id },
          }),
        ).toBe(0);
      }
    });

    it('consumes arrival events and delivers only a generic appointment update', async () => {
      const account = await recipient();
      const event = await resourceEvent('AppointmentCheckedIn');
      await prisma.notification.create({
        data: {
          recipientAccountId: account.id,
          kind: 'APPOINTMENT_UPDATED',
          title: 'Arrival recorded',
          message: 'Private fixture pet and arrival details',
          resourceType: 'appointment',
          resourceId: event.aggregateId,
        },
      });
      await worker.dispatchEvents();
      expect(
        await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
      ).toMatchObject({ status: 'PUBLISHED' });
      const email = await prisma.emailDelivery.findFirstOrThrow();
      expect(email).toMatchObject({
        recipientAccountId: account.id,
        category: 'APPOINTMENT_UPDATES',
      });
      expect(queue.decrypt(email.encryptedText!)).not.toContain(
        'Private fixture',
      );
      await worker.dispatchEvents();
      expect(await prisma.emailDelivery.count()).toBe(1);
    });

    it('delivers transactional notices written before the outbox insert', async () => {
      const account = await recipient();
      const resourceId = randomUUID();
      const occurredAt = new Date(Date.now() - 50);
      const event = await prisma.$transaction(async (tx) => {
        const notice = await tx.notification.create({
          data: {
            recipientAccountId: account.id,
            kind: 'APPOINTMENT_REQUESTED',
            title: 'Appointment update',
            message: 'Private fixture details',
            resourceType: 'appointment',
            resourceId,
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 25));
        const created = await tx.outboxEvent.create({
          data: {
            id: randomUUID(),
            name: 'AppointmentRequested',
            version: 1,
            aggregateId: resourceId,
            correlationId: randomUUID(),
            payload: {},
            occurredAt,
          },
        });
        expect(notice.createdAt.getTime()).toBeGreaterThanOrEqual(
          created.occurredAt.getTime(),
        );
        expect(notice.createdAt.getTime()).toBeLessThan(
          created.createdAt.getTime(),
        );
        return created;
      });
      await worker.dispatchEvents();
      expect(
        await prisma.emailDelivery.count({ where: { to: account.email } }),
      ).toBe(1);
      expect(
        await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
      ).toMatchObject({ status: 'PUBLISHED' });
    });

    it('queues every eligible recipient before acknowledging events with more than one notification page', async () => {
      const accounts = Array.from({ length: 105 }, () => ({
        id: randomUUID(),
        email: `${randomUUID()}@worker.test`,
        passwordHash: 'no-login-fixture',
        status: 'ACTIVE' as const,
        emailVerifiedAt: new Date(),
      }));
      await prisma.account.createMany({ data: accounts });
      const event = await resourceEvent();
      await prisma.notification.createMany({
        data: accounts.map((account) => ({
          recipientAccountId: account.id,
          kind: 'APPOINTMENT_REQUESTED' as const,
          title: 'Clinic request',
          message: 'Private request details',
          resourceType: 'appointment',
          resourceId: event.aggregateId,
        })),
      });
      await worker.dispatchEvents();
      expect(await prisma.emailDelivery.count()).toBe(accounts.length);
      expect(
        await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
      ).toMatchObject({ status: 'PUBLISHED' });
      await worker.dispatchEvents();
      expect(await prisma.emailDelivery.count()).toBe(accounts.length);
    });

    it('honors opt-outs before fanout and again for queued legacy mail while preserving mandatory security mail', async () => {
      const account = await recipient();
      const event = await resourceEvent();
      const notice = await prisma.notification.create({
        data: {
          recipientAccountId: account.id,
          kind: 'APPOINTMENT_UPDATED',
          title: 'Update',
          message: 'In-app update remains available',
          resourceType: 'appointment',
          resourceId: event.aggregateId,
        },
      });
      await prisma.notificationPreference.create({
        data: { accountId: account.id, appointmentUpdatesEmail: false },
      });
      await worker.dispatchEvents();
      expect(await prisma.emailDelivery.count()).toBe(0);
      expect(await prisma.notification.count()).toBe(1);
      // A pre-migration queued message has no category/account metadata.
      await prisma.$transaction((tx) =>
        queue.enqueue(tx, {
          idempotencyKey: `notification:${notice.id}`,
          to: account.email,
          subject: 'Queued update',
          text: 'Private details stay in-app',
          sensitive: false,
        }),
      );
      const security = await enqueue(`security:fixture:${randomUUID()}`);
      await worker.dispatchEmail();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].id).toBe(security.id);
      expect(
        await prisma.emailDelivery.findUniqueOrThrow({
          where: { idempotencyKey: `notification:${notice.id}` },
        }),
      ).toMatchObject({ state: 'CANCELLED', encryptedText: null });
    });

    it('rechecks preferences and current verified recipient identity before queued optional delivery', async () => {
      const optedOut = await recipient();
      const changedAddress = await recipient();
      const unverified = await recipient();
      const suspended = await recipient();
      const allowed = await recipient();
      for (const account of [
        optedOut,
        changedAddress,
        unverified,
        suspended,
        allowed,
      ]) {
        await prisma.$transaction((tx) =>
          queue.enqueue(tx, {
            idempotencyKey: `fixture:optional:${account.id}`,
            to: account.email,
            subject: 'Update',
            text: 'An authenticated workspace update',
            sensitive: false,
            category: 'CREDENTIAL_UPDATES',
            recipientAccountId: account.id,
          }),
        );
      }
      await prisma.notificationPreference.create({
        data: { accountId: optedOut.id, credentialUpdatesEmail: false },
      });
      await prisma.account.update({
        where: { id: changedAddress.id },
        data: { email: `${randomUUID()}@worker.test` },
      });
      await prisma.account.update({
        where: { id: unverified.id },
        data: { emailVerifiedAt: null },
      });
      await prisma.account.update({
        where: { id: suspended.id },
        data: { status: 'SUSPENDED' },
      });
      await worker.dispatchEmail();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].to).toBe(allowed.email);
      expect(
        await prisma.emailDelivery.count({
          where: { state: 'CANCELLED', encryptedText: null },
        }),
      ).toBe(4);
    });

    it('retains the in-app reminder but cancels optional mail after a reminder opt-out', async () => {
      const visit = await appointment();
      await reminders.enqueueDue();
      expect(await prisma.emailDelivery.count()).toBe(1);
      expect(
        await prisma.notification.count({
          where: { kind: 'APPOINTMENT_REMINDER' },
        }),
      ).toBe(1);
      await prisma.notificationPreference.create({
        data: {
          accountId: visit.requesterAccountId,
          appointmentRemindersEmail: false,
        },
      });
      await worker.dispatchEmail();
      expect(send).not.toHaveBeenCalled();
      expect(await prisma.emailDelivery.findFirstOrThrow()).toMatchObject({
        state: 'CANCELLED',
        encryptedText: null,
      });
      expect(
        await prisma.notification.count({
          where: { kind: 'APPOINTMENT_REMINDER' },
        }),
      ).toBe(1);
    });

    it('does not enqueue arrival reminders and cancels previously queued reminder mail after check-in', async () => {
      const arrived = await appointment();
      await prisma.appointment.update({
        where: { id: arrived.id },
        data: { checkedInAt: new Date() },
      });
      await reminders.enqueueDue();
      expect(await prisma.emailDelivery.count()).toBe(0);
      expect(await prisma.appointmentReminder.count()).toBe(0);
      const queued = await appointment();
      await reminders.enqueueDue();
      expect(await prisma.emailDelivery.count()).toBe(1);
      await prisma.appointment.update({
        where: { id: queued.id },
        data: { checkedInAt: new Date() },
      });
      const mail = await prisma.emailDelivery.findFirstOrThrow();
      expect(await reminders.isCurrent(mail.idempotencyKey)).toBe(false);
      expect(
        await reminders.recipientForDelivery(mail.idempotencyKey),
      ).toBeNull();
      await worker.dispatchEmail();
      expect(send).not.toHaveBeenCalled();
      expect(await prisma.emailDelivery.findFirstOrThrow()).toMatchObject({
        state: 'CANCELLED',
        encryptedText: null,
      });
      expect(
        await prisma.notification.count({
          where: { kind: 'APPOINTMENT_REMINDER' },
        }),
      ).toBe(1);
    });

    it('cancels queued reminder mail when a visit is marked no-show', async () => {
      const visit = await appointment();
      await reminders.enqueueDue();
      await prisma.appointment.update({
        where: { id: visit.id },
        data: { status: 'NO_SHOW' },
      });
      await worker.dispatchEmail();
      expect(send).not.toHaveBeenCalled();
      expect(await prisma.emailDelivery.findFirstOrThrow()).toMatchObject({
        state: 'CANCELLED',
        encryptedText: null,
      });
      await reminders.enqueueDue();
      expect(await prisma.emailDelivery.count()).toBe(1);
    });

    it('rolls back partial event fanout on failure and retries the durable event lease', async () => {
      const event = await resourceEvent();
      const deliver = jest
        .spyOn(notifications, 'deliverResourceNotifications')
        .mockImplementationOnce(async (tx) => {
          await queue.enqueue(tx, {
            idempotencyKey: 'fixture:partial-event',
            to: 'recipient@worker.test',
            subject: 'Rolled back',
            text: 'Private token',
            sensitive: true,
          });
          throw new Error('Sensitive handler failure must not be persisted');
        });
      await worker.dispatchEvents();
      expect(await prisma.emailDelivery.count()).toBe(0);
      const failed = await prisma.eventDelivery.findUniqueOrThrow({
        where: { eventId: event.id },
      });
      expect(failed).toMatchObject({
        state: 'PENDING',
        attempts: 1,
        lastError: 'EVENT_DISPATCH_FAILED',
        leaseId: null,
      });
      expect(failed.availableAt.getTime()).toBeGreaterThan(Date.now());
      expect(
        await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
      ).toMatchObject({ status: 'PENDING', publishedAt: null });
      deliver.mockRestore();
      await prisma.eventDelivery.update({
        where: { eventId: event.id },
        data: { availableAt: past() },
      });
      await worker.dispatchEvents();
      expect(
        await prisma.eventDelivery.findUniqueOrThrow({
          where: { eventId: event.id },
        }),
      ).toMatchObject({ state: 'DELIVERED', attempts: 2 });
      expect(
        await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
      ).toMatchObject({ status: 'PUBLISHED', attempts: 2 });
    });

    it('dead-letters a repeatedly failing event without falsely marking it published', async () => {
      const event = await resourceEvent();
      const handler = jest
        .spyOn(notifications, 'deliverResourceNotifications')
        .mockRejectedValue(new Error('Fixture downstream failure'));
      for (let attempt = 1; attempt <= 5; attempt++) {
        if (attempt > 1)
          await prisma.eventDelivery.update({
            where: { eventId: event.id },
            data: { availableAt: past() },
          });
        await worker.dispatchEvents();
        expect(
          await prisma.eventDelivery.findUniqueOrThrow({
            where: { eventId: event.id },
          }),
        ).toMatchObject({
          attempts: attempt,
          state: attempt === 5 ? 'FAILED' : 'PENDING',
        });
      }
      await worker.dispatchEvents();
      expect(handler).toHaveBeenCalledTimes(5);
      expect(
        await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
      ).toMatchObject({ status: 'PENDING', publishedAt: null });
    });

    it('recovers an abandoned event lease with its durable attempt count intact', async () => {
      const event = await resourceEvent();
      await prisma.eventDelivery.create({
        data: {
          eventId: event.id,
          state: 'PROCESSING',
          attempts: 1,
          leaseId: randomUUID(),
          leasedUntil: past(),
        },
      });
      await worker.dispatchEvents();
      expect(
        await prisma.eventDelivery.findUniqueOrThrow({
          where: { eventId: event.id },
        }),
      ).toMatchObject({
        state: 'DELIVERED',
        attempts: 2,
        leaseId: null,
        leasedUntil: null,
      });
      expect(
        await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
      ).toMatchObject({ status: 'PUBLISHED', attempts: 2 });
    });

    it('does not let a full batch of backed-off or failed events starve a later eligible event', async () => {
      const blocked = Array.from({ length: 110 }, (_, index) => ({
        id: randomUUID(),
        name: 'AppointmentRequested',
        version: 1,
        aggregateId: randomUUID(),
        correlationId: randomUUID(),
        payload: {},
        occurredAt: new Date(Date.now() - 120000 - index),
      }));
      await prisma.outboxEvent.createMany({ data: blocked });
      await prisma.eventDelivery.createMany({
        data: blocked.map((event, index) => ({
          eventId: event.id,
          state: index % 2 ? 'FAILED' : 'PENDING',
          availableAt: future(),
        })),
      });
      const eligible = await resourceEvent();
      await worker.dispatchEvents();
      expect(
        await prisma.outboxEvent.findUniqueOrThrow({
          where: { id: eligible.id },
        }),
      ).toMatchObject({ status: 'PUBLISHED' });
      expect(
        await prisma.outboxEvent.count({
          where: {
            id: { in: blocked.map((event) => event.id) },
            status: 'PENDING',
          },
        }),
      ).toBe(blocked.length);
    });

    it('creates one reminder per appointment time and cancels queued mail after owner cancellation', async () => {
      const visit = await appointment();
      await reminders.enqueueDue();
      await reminders.enqueueDue();
      expect(await prisma.appointmentReminder.count()).toBe(1);
      expect(
        await prisma.notification.count({
          where: { kind: 'APPOINTMENT_REMINDER' },
        }),
      ).toBe(1);
      expect(await prisma.emailDelivery.count()).toBe(1);
      await prisma.appointment.update({
        where: { id: visit.id },
        data: { status: 'CANCELLED' },
      });
      await worker.dispatchEmail();
      expect(send).not.toHaveBeenCalled();
      expect(await prisma.emailDelivery.findFirstOrThrow()).toMatchObject({
        state: 'CANCELLED',
        encryptedText: null,
      });
    });

    it('cancels a superseded reminder and sends only the reminder for the newly accepted time', async () => {
      const visit = await appointment();
      await reminders.enqueueDue();
      await prisma.appointment.update({
        where: { id: visit.id },
        data: {
          startsAt: new Date(Date.now() + 7200000),
          proposalVersion: { increment: 1 },
        },
      });
      await reminders.enqueueDue();
      expect(await prisma.appointmentReminder.count()).toBe(2);
      await worker.dispatchEmail();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].text).not.toMatch(
        /Private Owner Name|Private Pet Name|Private clinical visit details/,
      );
      expect(
        await prisma.emailDelivery.count({ where: { state: 'CANCELLED' } }),
      ).toBe(1);
      expect(
        await prisma.emailDelivery.count({ where: { state: 'DELIVERED' } }),
      ).toBe(1);
    });

    it('records cycle failure and subsequent successful recovery in the worker heartbeat', async () => {
      const enqueueDue = jest
        .spyOn(reminders, 'enqueueDue')
        .mockRejectedValueOnce(new Error('Fixture database timeout'));
      await expect(worker.tick()).rejects.toThrow('Fixture database timeout');
      expect(
        await prisma.workerHeartbeat.findUniqueOrThrow({
          where: { name: 'delivery' },
        }),
      ).toMatchObject({
        lastError: 'WORKER_CYCLE_FAILED',
        lastSucceededAt: null,
      });
      enqueueDue.mockRestore();
      await worker.tick();
      const heartbeat = await prisma.workerHeartbeat.findUniqueOrThrow({
        where: { name: 'delivery' },
      });
      expect(heartbeat.lastError).toBeNull();
      expect(heartbeat.lastSucceededAt).not.toBeNull();
    });

    it('protects operations status and retries through real authenticated HTTP without exposing mail content', async () => {
      const http = app.getHttpServer() as Parameters<typeof request>[0];
      const member = await principal();
      const operator = await principal(true);
      const email = await enqueue();
      await prisma.emailDelivery.update({
        where: { id: email.id },
        data: {
          state: 'FAILED',
          attempts: 5,
          lastError: 'MAIL_DELIVERY_FAILED',
        },
      });
      const event = await resourceEvent();
      const delivery = await prisma.eventDelivery.create({
        data: {
          eventId: event.id,
          state: 'FAILED',
          attempts: 5,
          lastError: 'EVENT_DISPATCH_FAILED',
        },
      });
      const waiting = await resourceEvent();
      await resourceEvent('FutureDomainEvent');
      await request(http).get('/api/v1/platform/delivery').expect(401);
      await request(http)
        .get('/api/v1/platform/delivery')
        .set('authorization', `Bearer ${member}`)
        .expect(403);
      await request(http)
        .post(`/api/v1/platform/delivery/email/${email.id}/retry`)
        .set('authorization', `Bearer ${member}`)
        .expect(403);
      expect(
        await prisma.emailDelivery.findUniqueOrThrow({
          where: { id: email.id },
        }),
      ).toMatchObject({ state: 'FAILED', attempts: 5 });
      const status = await request(http)
        .get('/api/v1/platform/delivery')
        .set('authorization', `Bearer ${operator}`)
        .expect(200);
      const publicStatus = JSON.stringify(status.body as unknown);
      expect(status.body as unknown).toMatchObject({
        eventStates: expect.arrayContaining([
          { state: 'PENDING', _count: { _all: 1 } },
        ]) as unknown,
        oldestPendingEventAt: waiting.createdAt.toISOString(),
        unsupportedEventCount: 1,
        failedEmail: expect.arrayContaining([
          expect.objectContaining({ id: email.id, retryable: true }),
        ]) as unknown,
      });
      expect(publicStatus).not.toMatch(
        /encryptedText|fixture-secret|recipient@worker.test/,
      );
      await request(http)
        .post(`/api/v1/platform/delivery/email/${email.id}/retry`)
        .set('authorization', `Bearer ${operator}`)
        .expect(200);
      expect(
        await prisma.emailDelivery.findUniqueOrThrow({
          where: { id: email.id },
        }),
      ).toMatchObject({ state: 'PENDING', attempts: 0, lastError: null });
      await request(http)
        .post(`/api/v1/platform/delivery/email/${email.id}/retry`)
        .set('authorization', `Bearer ${operator}`)
        .expect(409);
      await request(http)
        .post(`/api/v1/platform/delivery/event/${delivery.id}/retry`)
        .set('authorization', `Bearer ${operator}`)
        .expect(200);
      expect(
        await prisma.eventDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        }),
      ).toMatchObject({ state: 'PENDING', attempts: 0, lastError: null });
      expect(
        await prisma.auditEvent.count({
          where: { action: 'platform.delivery.retry' },
        }),
      ).toBe(2);
      const expired = await enqueue(undefined, { expiresAt: past() });
      await prisma.emailDelivery.update({
        where: { id: expired.id },
        data: { state: 'FAILED', attempts: 5 },
      });
      await request(http)
        .post(`/api/v1/platform/delivery/email/${expired.id}/retry`)
        .set('authorization', `Bearer ${operator}`)
        .expect(409);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'platform.delivery.retry' },
        }),
      ).toBe(2);
    });
  },
);
