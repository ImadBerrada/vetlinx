import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
  ConflictException,
  HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../persistence/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../modules/identity/access-token.guard';
import { RequireSystemRoles } from '../../modules/identity/required-roles.decorator';
import { SystemRolesGuard } from '../../modules/identity/system-roles.guard';

@ApiTags('Delivery operations')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, SystemRolesGuard)
@RequireSystemRoles('OPERATIONS_ADMIN')
@Controller({ path: 'platform/delivery', version: '1' })
export class DeliveryOperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async status() {
    const [heartbeat, emailStates, eventStates, failedEmail, failedEvents] =
      await Promise.all([
        this.prisma.workerHeartbeat.findUnique({ where: { name: 'delivery' } }),
        this.prisma.emailDelivery.groupBy({
          by: ['state'],
          _count: { _all: true },
        }),
        this.prisma.eventDelivery.groupBy({
          by: ['state'],
          _count: { _all: true },
        }),
        this.prisma.emailDelivery.findMany({
          where: { state: 'FAILED' },
          take: 50,
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            attempts: true,
            lastError: true,
            createdAt: true,
            expiresAt: true,
          },
        }),
        this.prisma.eventDelivery.findMany({
          where: { state: 'FAILED' },
          take: 50,
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            eventId: true,
            attempts: true,
            lastError: true,
            createdAt: true,
          },
        }),
      ]);
    return {
      heartbeat,
      healthy: Boolean(
        heartbeat?.lastSucceededAt &&
        Date.now() - heartbeat.lastSucceededAt.getTime() < 120000 &&
        !heartbeat.lastError,
      ),
      emailStates,
      eventStates,
      failedEmail,
      failedEvents,
    };
  }

  @Post('email/:id/retry')
  @HttpCode(200)
  async retryEmail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.emailDelivery.updateMany({
        where: {
          id,
          state: 'FAILED',
          encryptedText: { not: null },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        data: {
          state: 'PENDING',
          attempts: 0,
          availableAt: new Date(),
          lastError: null,
          leaseId: null,
          leasedUntil: null,
        },
      });
      if (!result.count)
        throw new ConflictException(
          'Only unexpired failed deliveries can be retried',
        );
      await this.audit.recordInTransaction(tx, {
        actorId: request.user.accountId,
        action: 'platform.delivery.retry',
        resourceType: 'email_delivery',
        resourceId: id,
        occurredAt: new Date().toISOString(),
        correlationId: request.header('x-correlation-id') ?? randomUUID(),
      });
    });
    return { queued: true };
  }

  @Post('event/:id/retry')
  @HttpCode(200)
  async retryEvent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.eventDelivery.updateMany({
        where: { id, state: 'FAILED' },
        data: {
          state: 'PENDING',
          attempts: 0,
          availableAt: new Date(),
          lastError: null,
          leaseId: null,
          leasedUntil: null,
        },
      });
      if (!result.count)
        throw new ConflictException(
          'Only failed event deliveries can be retried',
        );
      await this.audit.recordInTransaction(tx, {
        actorId: request.user.accountId,
        action: 'platform.delivery.retry',
        resourceType: 'event_delivery',
        resourceId: id,
        occurredAt: new Date().toISOString(),
        correlationId: request.header('x-correlation-id') ?? randomUUID(),
      });
    });
    return { queued: true };
  }
}
