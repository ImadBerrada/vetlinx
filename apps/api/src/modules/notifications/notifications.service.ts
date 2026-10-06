import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../platform/persistence/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { NotificationsPublicApi } from './notifications.public';
import { MailQueueService } from '../../platform/delivery/mail-queue.service';
import {
  IDENTITY_PUBLIC_API,
  type IdentityPublicApi,
} from '../identity/identity.public';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationsService implements NotificationsPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailQueueService,
    private readonly config: ConfigService,
    @Inject(IDENTITY_PUBLIC_API) private readonly identity: IdentityPublicApi,
  ) {}

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
    const notices = await transaction.notification.findMany({
      where: { resourceType, resourceId, createdAt: { gte: since } },
      take: 100,
    });
    const contacts = await this.identity.findEmailRecipients(
      notices.map((notice) => notice.recipientAccountId),
    );
    for (const notice of notices) {
      const contact = contacts.find(
        (item) => item.accountId === notice.recipientAccountId,
      );
      if (!contact) continue;
      // Sensitive intake/evidence/recruitment details stay behind authenticated access.
      await this.mail.enqueue(transaction, {
        idempotencyKey: `notification:${notice.id}`,
        to: contact.email,
        subject: 'An update in VetLinX',
        text: `There is an update in your VetLinX workspace. Sign in to view it: ${this.config.getOrThrow<string>('FRONTEND_ORIGIN')}/get-started`,
        sensitive: false,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
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
