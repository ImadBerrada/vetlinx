import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../platform/persistence/prisma.service';
import {
  IDENTITY_PUBLIC_API,
  type IdentityPublicApi,
} from '../identity/identity.public';
import {
  NOTIFICATIONS_PUBLIC_API,
  type NotificationsPublicApi,
} from '../notifications/notifications.public';

@Injectable()
export class AppointmentRemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(IDENTITY_PUBLIC_API) private readonly identity: IdentityPublicApi,
    @Inject(NOTIFICATIONS_PUBLIC_API)
    private readonly notifications: NotificationsPublicApi,
  ) {}

  private key(value: { id: string; startsAt: Date }) {
    return `appointment-reminder:${value.id}:${value.startsAt.getTime()}`;
  }

  async isCurrent(key: string) {
    const [, id] = key.split(':');
    if (!id) return false;
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      select: { id: true, startsAt: true, proposalVersion: true, status: true },
    });
    return Boolean(
      appointment &&
      appointment.status === 'CONFIRMED' &&
      appointment.startsAt > new Date() &&
      this.key(appointment) === key,
    );
  }

  async enqueueDue(now = new Date()) {
    const candidates = await this.prisma.$queryRaw<
      Array<{ id: string; requesterAccountId: string }>
    >`
      SELECT a.id, a.requester_account_id AS "requesterAccountId" FROM appointments.appointments a
      WHERE a.status = 'CONFIRMED' AND a.starts_at > ${now} AND a.starts_at <= ${new Date(now.getTime() + 86400000)}
      AND NOT EXISTS (SELECT 1 FROM appointments.appointment_reminders r WHERE r.appointment_id = a.id AND r.starts_at = a.starts_at)
      ORDER BY a.starts_at, a.id LIMIT 100`;
    for (const candidate of candidates) {
      const contacts = await this.identity.findEmailRecipients([
        candidate.requesterAccountId,
      ]);
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM appointments.appointments WHERE id = ${candidate.id}::uuid FOR UPDATE`;
        const current = await tx.appointment.findUnique({
          where: { id: candidate.id },
        });
        if (
          !current ||
          current.status !== 'CONFIRMED' ||
          current.startsAt <= now ||
          current.startsAt > new Date(now.getTime() + 86400000)
        )
          return;
        const key = this.key(current);
        const created = await tx.appointmentReminder.createMany({
          data: [
            {
              idempotencyKey: key,
              appointmentId: current.id,
              startsAt: current.startsAt,
            },
          ],
          skipDuplicates: true,
        });
        if (!created.count) return;
        await this.notifications.enqueue(tx, [candidate.requesterAccountId], {
          kind: 'APPOINTMENT_REMINDER',
          title: 'Appointment reminder',
          message:
            'Open your appointments to review the current status of your upcoming visit.',
          resourceType: 'appointment',
          resourceId: current.id,
          deduplicationKey: key,
        });
        for (const contact of contacts)
          await this.notifications.enqueueEmail(tx, {
            idempotencyKey: key,
            to: contact.email,
            subject: 'Upcoming VetLinX appointment',
            text: `You have an upcoming confirmed appointment. Sign in to view its details: ${this.config.getOrThrow<string>('FRONTEND_ORIGIN')}/owner`,
            sensitive: false,
            expiresAt: current.startsAt,
          });
      });
    }
  }
}
