import { SchedulingService } from '../../modules/appointments/scheduling.service';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../persistence/prisma.service';
import { MailQueueService } from './mail-queue.service';
import { MailTransportService } from './mail-transport.service';
import {
  NOTIFICATIONS_PUBLIC_API,
  type NotificationsPublicApi,
} from '../../modules/notifications/notifications.public';
import { AppointmentRemindersService } from '../../modules/appointments/appointment-reminders.service';
import { Prisma, type OutboxEvent } from '../../generated/prisma/client';
import {
  CREDENTIALS_PUBLIC_API,
  type CredentialsPublicApi,
} from '../../modules/credentials/credentials.public';

import { DELIVERY_EVENT_RESOURCES as EVENT_RESOURCES } from './delivery-event-resources';
import {
  IDENTITY_PUBLIC_API,
  type IdentityPublicApi,
} from '../../modules/identity/identity.public';

@Injectable()
export class DeliveryWorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailQueueService,
    private readonly transport: MailTransportService,
    private readonly reminders: AppointmentRemindersService,
    private readonly scheduling: SchedulingService,
    @Inject(NOTIFICATIONS_PUBLIC_API)
    private readonly notifications: NotificationsPublicApi,
    @Inject(CREDENTIALS_PUBLIC_API)
    private readonly credentials: CredentialsPublicApi,
    @Inject(IDENTITY_PUBLIC_API) private readonly identity: IdentityPublicApi,
  ) {}

  async tick() {
    await this.prisma.workerHeartbeat.upsert({
      where: { name: 'delivery' },
      create: { name: 'delivery', lastSeenAt: new Date() },
      update: { lastSeenAt: new Date() },
    });
    try {
      await this.identity.pruneExpiredSecurityArtifacts();
      await this.scheduling.pruneExpiredHolds();
      await this.credentials.expireDue();
      await this.reminders.enqueueDue();
      await this.dispatchEvents();
      await this.dispatchEmail();
      await this.prisma.workerHeartbeat.update({
        where: { name: 'delivery' },
        data: {
          lastSeenAt: new Date(),
          lastSucceededAt: new Date(),
          lastError: null,
        },
      });
    } catch (error: unknown) {
      await this.prisma.workerHeartbeat.update({
        where: { name: 'delivery' },
        data: { lastError: 'WORKER_CYCLE_FAILED' },
      });
      throw error;
    }
  }

  async dispatchEvents() {
    // Backoff and dead letters must never block later eligible events.
    const events = await this.prisma.$queryRaw<OutboxEvent[]>(Prisma.sql`
      SELECT e.id, e.name, e.version, e.aggregate_id AS "aggregateId",
        e.correlation_id AS "correlationId", e.causation_id AS "causationId", e.payload,
        e.occurred_at AS "occurredAt", e.status, e.attempts, e.published_at AS "publishedAt",
        e.last_error AS "lastError", e.created_at AS "createdAt"
      FROM platform.outbox_events e LEFT JOIN platform.event_deliveries d ON d.event_id = e.id
      WHERE e.status = 'PENDING' AND e.version = 1 AND e.name IN (${Prisma.join(Object.keys(EVENT_RESOURCES))})
        AND (d.id IS NULL OR (d.state = 'PENDING' AND d.available_at <= NOW())
          OR (d.state = 'PROCESSING' AND d.leased_until < NOW()))
      ORDER BY e.occurred_at ASC LIMIT 100
    `);
    for (const event of events) {
      await this.prisma.eventDelivery.createMany({
        data: [{ eventId: event.id }],
        skipDuplicates: true,
      });
      const leaseId = randomUUID();
      const claimed = await this.prisma.eventDelivery.updateMany({
        where: {
          eventId: event.id,
          OR: [
            { state: 'PENDING', availableAt: { lte: new Date() } },
            { state: 'PROCESSING', leasedUntil: { lt: new Date() } },
          ],
        },
        data: {
          state: 'PROCESSING',
          leaseId,
          leasedUntil: new Date(Date.now() + 120000),
          attempts: { increment: 1 },
        },
      });
      if (!claimed.count) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          const owned = await tx.eventDelivery.findFirst({
            where: { eventId: event.id, leaseId, state: 'PROCESSING' },
          });
          if (!owned) return;
          await this.notifications.deliverResourceNotifications(
            tx,
            EVENT_RESOURCES[event.name],
            event.aggregateId,
            // Domain commands capture occurrence before their writes. A notice may
            // precede the outbox insert, so its insertion timestamp is not the boundary.
            event.occurredAt,
          );
          await tx.eventDelivery.updateMany({
            where: { eventId: event.id, leaseId },
            data: {
              state: 'DELIVERED',
              finishedAt: new Date(),
              leaseId: null,
              leasedUntil: null,
              lastError: null,
            },
          });
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              attempts: owned.attempts,
            },
          });
        });
      } catch {
        const job = await this.prisma.eventDelivery.findUnique({
          where: { eventId: event.id },
        });
        await this.prisma.eventDelivery.updateMany({
          where: { eventId: event.id, leaseId },
          data: {
            state: (job?.attempts ?? 0) >= 5 ? 'FAILED' : 'PENDING',
            availableAt: new Date(Date.now() + this.delay(job?.attempts ?? 1)),
            lastError: 'EVENT_DISPATCH_FAILED',
            leaseId: null,
            leasedUntil: null,
          },
        });
      }
    }
  }

  async dispatchEmail() {
    const now = new Date();
    const emails = await this.prisma.emailDelivery.findMany({
      where: {
        OR: [
          { state: 'PENDING', availableAt: { lte: now } },
          { state: 'PROCESSING', leasedUntil: { lt: now } },
        ],
      },
      orderBy: { availableAt: 'asc' },
      take: 50,
    });
    for (const email of emails) {
      const leaseId = randomUUID();
      const claimed = await this.prisma.emailDelivery.updateMany({
        where: {
          id: email.id,
          OR: [
            { state: 'PENDING', availableAt: { lte: now } },
            { state: 'PROCESSING', leasedUntil: { lt: now } },
          ],
        },
        data: {
          state: 'PROCESSING',
          leaseId,
          leasedUntil: new Date(Date.now() + 120000),
          attempts: { increment: 1 },
        },
      });
      if (!claimed.count) continue;
      try {
        const expired = email.expiresAt && email.expiresAt <= new Date();
        const stale =
          email.idempotencyKey.startsWith('appointment-reminder:') &&
          !(await this.reminders.isCurrent(email.idempotencyKey));
        const reminder = email.idempotencyKey.startsWith(
          'appointment-reminder:',
        );
        const canDeliver =
          !expired &&
          !stale &&
          (await this.notifications.canDeliverEmail({
            ...email,
            recipientAccountId:
              email.recipientAccountId ??
              (reminder
                ? await this.reminders.recipientForDelivery(
                    email.idempotencyKey,
                  )
                : null),
            category:
              email.category ?? (reminder ? 'APPOINTMENT_REMINDERS' : null),
          }));
        if (expired || stale || !canDeliver) {
          await this.prisma.emailDelivery.updateMany({
            where: { id: email.id, leaseId },
            data: {
              state: 'CANCELLED',
              encryptedText: null,
              leaseId: null,
              leasedUntil: null,
            },
          });
          continue;
        }
        if (!email.encryptedText) throw new Error('Missing encrypted content');
        await this.transport.send({
          id: email.id,
          to: email.to,
          subject: email.subject,
          text: this.mail.decrypt(email.encryptedText),
        });
        await this.prisma.emailDelivery.updateMany({
          where: { id: email.id, leaseId },
          data: {
            state: 'DELIVERED',
            sentAt: new Date(),
            encryptedText: null,
            leaseId: null,
            leasedUntil: null,
            lastError: null,
          },
        });
      } catch {
        const attempts = email.attempts + 1;
        await this.prisma.emailDelivery.updateMany({
          where: { id: email.id, leaseId },
          data: {
            state: attempts >= 5 ? 'FAILED' : 'PENDING',
            availableAt: new Date(Date.now() + this.delay(attempts)),
            lastError: 'MAIL_DELIVERY_FAILED',
            leaseId: null,
            leasedUntil: null,
          },
        });
      }
    }
  }

  private delay(attempts: number) {
    return Math.min(3600000, 30000 * 2 ** Math.min(attempts, 7));
  }
}
