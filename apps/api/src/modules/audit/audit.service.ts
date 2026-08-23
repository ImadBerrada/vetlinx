import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../platform/persistence/prisma.service';
import type { AuditEntry } from './audit-entry';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.persist(this.prisma, entry);
  }

  async recordInTransaction(
    transaction: Prisma.TransactionClient,
    entry: AuditEntry,
  ): Promise<void> {
    await this.persist(transaction, entry);
  }

  private async persist(
    client: Prisma.TransactionClient | PrismaService,
    entry: AuditEntry,
  ): Promise<void> {
    await client.auditEvent.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        occurredAt: new Date(entry.occurredAt),
        correlationId: entry.correlationId,
        reason: entry.reason,
        changes: entry.changes as Prisma.InputJsonValue | undefined,
      },
    });
    this.logger.log(JSON.stringify({ type: 'audit', ...entry }));
  }
}
