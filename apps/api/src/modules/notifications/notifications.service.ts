import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../platform/persistence/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type {
  NotificationsPublicApi,
  NotificationEmailCategory,
} from './notifications.public';
import type { NotificationKind } from '../../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import type { UpdateNotificationPreferencesDto } from './notification-preferences.dto';
import { MailQueueService } from '../../platform/delivery/mail-queue.service';
import {
  IDENTITY_PUBLIC_API,
  type IdentityPublicApi,
} from '../identity/identity.public';
import { ConfigService } from '@nestjs/config';

const preferenceSelect = {
  appointmentUpdatesEmail: true,
  appointmentRemindersEmail: true,
  credentialUpdatesEmail: true,
  version: true,
} as const;
const preferenceDefaults = {
  appointmentUpdatesEmail: true,
  appointmentRemindersEmail: true,
  credentialUpdatesEmail: true,
  version: 0,
};
const categoryPreference = {
  APPOINTMENT_UPDATES: 'appointmentUpdatesEmail',
  APPOINTMENT_REMINDERS: 'appointmentRemindersEmail',
  CREDENTIAL_UPDATES: 'credentialUpdatesEmail',
} as const;

@Injectable()
export class NotificationsService implements NotificationsPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailQueueService,
    private readonly config: ConfigService,
    @Inject(IDENTITY_PUBLIC_API) private readonly identity: IdentityPublicApi,
    private readonly audit: AuditService,
  ) {}

  async getPreferences(accountId: string) {
    return (
      (await this.prisma.notificationPreference.findUnique({
        where: { accountId },
        select: preferenceSelect,
      })) ?? { ...preferenceDefaults }
    );
  }

  async updatePreferences(
    accountId: string,
    dto: UpdateNotificationPreferencesDto,
    correlationId: string,
  ) {
    const values = {
      appointmentUpdatesEmail: dto.appointmentUpdatesEmail,
      appointmentRemindersEmail: dto.appointmentRemindersEmail,
      credentialUpdatesEmail: dto.credentialUpdatesEmail,
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.notificationPreference.findUnique({
          where: { accountId },
          select: preferenceSelect,
        });
        if ((current?.version ?? 0) !== dto.expectedVersion)
          throw new ConflictException(
            'Your notification settings changed. Reload the latest settings before saving.',
          );
        if (!current) {
          await tx.notificationPreference.create({
            data: { accountId, ...values, version: 1 },
          });
        } else {
          const updated = await tx.notificationPreference.updateMany({
            where: { accountId, version: dto.expectedVersion },
            data: { ...values, version: { increment: 1 } },
          });
          if (!updated.count)
            throw new ConflictException(
              'Your notification settings changed. Reload the latest settings before saving.',
            );
        }
        await this.audit.recordInTransaction(tx, {
          actorId: accountId,
          action: 'notification.preferences.updated',
          resourceType: 'notification_preferences',
          resourceId: accountId,
          occurredAt: new Date().toISOString(),
          correlationId,
          changes: {
            from: current ?? preferenceDefaults,
            to: { ...values, version: dto.expectedVersion + 1 },
          },
        });
        return tx.notificationPreference.findUniqueOrThrow({
          where: { accountId },
          select: preferenceSelect,
        });
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Your notification settings changed. Reload the latest settings before saving.',
        );
      throw error;
    }
  }

  private category(kind: NotificationKind): NotificationEmailCategory | null {
    if (kind === 'APPOINTMENT_REQUESTED' || kind === 'APPOINTMENT_UPDATED')
      return 'APPOINTMENT_UPDATES';
    if (kind === 'APPOINTMENT_REMINDER') return 'APPOINTMENT_REMINDERS';
    if (
      [
        'CREDENTIAL_VERIFIED',
        'CREDENTIAL_REJECTED',
        'CREDENTIAL_EXPIRED',
        'CREDENTIAL_REVOKED',
        'VERIFICATION_INFORMATION_REQUESTED',
      ].includes(kind)
    )
      return 'CREDENTIAL_UPDATES';
    return null;
  }

  async canDeliverEmail(
    message: Parameters<NotificationsPublicApi['canDeliverEmail']>[0],
  ): Promise<boolean> {
    let accountId = message.recipientAccountId;
    let category = message.category;
    // Respect settings for legacy queued notification messages after migration too.
    if (!category && message.idempotencyKey.startsWith('notification:')) {
      const id = message.idempotencyKey.slice('notification:'.length);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
      const notice = await this.prisma.notification.findUnique({
        where: { id },
        select: { recipientAccountId: true, kind: true },
      });
      if (!notice) return false;
      accountId = notice.recipientAccountId;
      category = this.category(notice.kind);
      if (!category) return false;
    }
    if (!category) return true; // Security/recovery and other explicitly mandatory mail.
    if (!accountId || !Object.hasOwn(categoryPreference, category))
      return false;
    const preferences = await this.getPreferences(accountId);
    if (!preferences[categoryPreference[category as NotificationEmailCategory]])
      return false;
    const contacts = await this.identity.findEmailRecipients([accountId]);
    return contacts.some((contact) => contact.email === message.to);
  }

  enqueueEmail(
    transaction: Prisma.TransactionClient,
    message: Parameters<NotificationsPublicApi['enqueueEmail']>[1],
  ) {
    return this.mail.enqueue(transaction, message);
  }

  async deliverResourceNotifications(
    transaction: Prisma.TransactionClient,
    resourceType: string,
    resourceId: string,
    since: Date,
  ) {
    let cursor: string | undefined;
    while (true) {
      const notices = await transaction.notification.findMany({
        where: { resourceType, resourceId, createdAt: { gte: since } },
        take: 100,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const contacts = await this.identity.findEmailRecipients(
        notices.map((notice) => notice.recipientAccountId),
      );
      for (const notice of notices) {
        const contact = contacts.find(
          (item) => item.accountId === notice.recipientAccountId,
        );
        if (!contact) continue;
        const category = this.category(notice.kind);
        if (!category) continue;
        const preferences = await this.getPreferences(
          notice.recipientAccountId,
        );
        if (!preferences[categoryPreference[category]]) continue;
        // Sensitive intake/evidence/recruitment details stay behind authenticated access.
        await this.mail.enqueue(transaction, {
          idempotencyKey: `notification:${notice.id}`,
          to: contact.email,
          subject: 'An update in VetLinX',
          text: `There is an update in your VetLinX workspace. Sign in to view it: ${this.config.getOrThrow<string>('FRONTEND_ORIGIN')}/get-started`,
          sensitive: false,
          expiresAt: new Date(Date.now() + 7 * 86400000),
          recipientAccountId: notice.recipientAccountId,
          category,
        });
      }
      if (notices.length < 100) break;
      cursor = notices[notices.length - 1].id;
    }
  }

  async enqueue(
    transaction: Prisma.TransactionClient,
    recipients: string[],
    message: Parameters<NotificationsPublicApi['enqueue']>[2],
  ): Promise<void> {
    if (!recipients.length) return;
    await transaction.notification.createMany({
      data: [...new Set(recipients)].map((recipientAccountId) => ({
        recipientAccountId,
        ...message,
        deduplicationKey: message.deduplicationKey
          ? `${message.deduplicationKey}:${recipientAccountId}`
          : undefined,
      })),
      skipDuplicates: true,
    });
  }

  listMine(accountId: string) {
    return this.prisma.notification.findMany({
      where: { recipientAccountId: accountId },
      select: {
        id: true,
        kind: true,
        status: true,
        title: true,
        message: true,
        resourceType: true,
        resourceId: true,
        readAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(accountId: string, notificationId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientAccountId: accountId,
        status: 'UNREAD',
      },
      data: { status: 'READ', readAt: new Date() },
    });
    if (updated.count === 0) {
      const existing = await this.prisma.notification.findFirst({
        where: { id: notificationId, recipientAccountId: accountId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.findFirstOrThrow({
      where: { id: notificationId, recipientAccountId: accountId },
    });
  }
}
