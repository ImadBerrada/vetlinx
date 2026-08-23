import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import type { DomainEvent } from './domain-event';
import type { EventPublisher } from './event-publisher.port';
import type { OutboxWriter } from './outbox-writer.port';

@Injectable()
export class OutboxEventPublisher implements EventPublisher, OutboxWriter {
  constructor(private readonly prisma: PrismaService) {}

  async publish(
    events: ReadonlyArray<DomainEvent<Record<string, unknown>>>,
  ): Promise<void> {
    if (events.length === 0) return;

    await this.prisma.$transaction(async (transaction) => {
      await this.enqueue(transaction, events);
    });
  }

  async enqueue(
    transaction: Prisma.TransactionClient,
    events: ReadonlyArray<DomainEvent<Record<string, unknown>>>,
  ): Promise<void> {
    await Promise.all(
      events.map((event) =>
        transaction.outboxEvent.create({
          data: {
            id: event.id,
            name: event.name,
            version: event.version,
            aggregateId: event.aggregateId,
            correlationId: event.correlationId,
            causationId: event.causationId,
            payload: event.payload as Prisma.InputJsonValue,
            occurredAt: new Date(event.occurredAt),
          },
        }),
      ),
    );
  }
}
