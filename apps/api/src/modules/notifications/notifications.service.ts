import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../platform/persistence/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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
