import type { Prisma } from '../../generated/prisma/client';
import type { DomainEvent } from './domain-event';

export const OUTBOX_WRITER = Symbol('OUTBOX_WRITER');

export interface OutboxWriter {
  enqueue(
    transaction: Prisma.TransactionClient,
    events: ReadonlyArray<DomainEvent<Record<string, unknown>>>,
  ): Promise<void>;
}
