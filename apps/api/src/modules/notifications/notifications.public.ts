import type { Prisma } from '../../generated/prisma/client';
import type { NotificationKind } from '../../generated/prisma/enums';

export const NOTIFICATIONS_PUBLIC_API = Symbol('NOTIFICATIONS_PUBLIC_API');
export interface NotificationsPublicApi {
  enqueue(
    transaction: Prisma.TransactionClient,
    recipients: string[],
    message: {
      kind: NotificationKind;
      title: string;
      message: string;
      resourceType: string;
      resourceId: string;
      deduplicationKey?: string;
    },
  ): Promise<void>;
  enqueueEmail(
    transaction: Prisma.TransactionClient,
    message: {
      idempotencyKey: string;
      to: string;
      subject: string;
      text: string;
      sensitive: boolean;
      expiresAt?: Date;
    },
  ): Promise<void>;
  deliverResourceNotifications(
    transaction: Prisma.TransactionClient,
    resourceType: string,
    resourceId: string,
    since: Date,
  ): Promise<void>;
}
