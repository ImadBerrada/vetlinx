import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  OUTBOX_WRITER,
  type OutboxWriter,
} from '../../platform/events/outbox-writer.port';
import { PrismaService } from '../../platform/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  PROFESSIONALS_PUBLIC_API,
  type ProfessionalsPublicApi,
} from '../professionals/professionals.public';
import type { CreateCredentialDto } from './dto/create-credential.dto';
import type { CredentialsPublicApi } from './credentials.public';
import { credentialSelect } from './credential-select';
import {
  NOTIFICATIONS_PUBLIC_API,
  type NotificationsPublicApi,
} from '../notifications/notifications.public';

@Injectable()
export class CredentialsService implements CredentialsPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(PROFESSIONALS_PUBLIC_API)
    private readonly professionals: ProfessionalsPublicApi,
    @Inject(NOTIFICATIONS_PUBLIC_API)
    private readonly notifications: NotificationsPublicApi,
  ) {}

  async listMine(accountId: string) {
    const professional = await this.requireProfessional(accountId);
    const credentials = await this.prisma.credential.findMany({
      where: { professionalProfileId: professional.id },
      select: credentialSelect,
      orderBy: { createdAt: 'desc' },
    });
    const today = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    return credentials.map((credential) => ({
      ...credential,
      effectiveStatus:
        credential.status === 'VERIFIED' &&
        credential.expiryDate &&
        credential.expiryDate < today
          ? ('EXPIRED' as const)
          : credential.status,
    }));
  }

  async findOwnedByAccount(accountId: string, credentialId: string) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional) return null;
    return this.prisma.credential.findFirst({
      where: { id: credentialId, professionalProfileId: professional.id },
      select: { id: true, professionalProfileId: true, status: true },
    });
  }

  async findLifecycle(credentialId: string) {
    const credential = await this.prisma.credential.findUnique({
      where: { id: credentialId },
      select: credentialSelect,
    });
    if (!credential) return null;
    const today = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    return {
      ...credential,
      effectiveStatus:
        credential.status === 'VERIFIED' &&
        credential.expiryDate &&
        credential.expiryDate < today
          ? ('EXPIRED' as const)
          : credential.status,
    };
  }

  async revokeCredential(
    actorAccountId: string,
    credentialId: string,
    reasonInput: string,
    correlationId: string,
    source: 'OPERATIONS' | 'ASSIGNED_REVIEWER',
    verificationRequestId?: string,
  ) {
    const reason = reasonInput.trim();
    if (reason.length < 10 || reason.length > 1000)
      throw new BadRequestException(
        'A specific revocation reason of 10 to 1000 characters is required',
      );
    const credential = await this.findLifecycle(credentialId);
    if (!credential) throw new NotFoundException('Credential not found');
    const professional = await this.professionals.findSummary(
      credential.professionalProfileId,
    );
    if (!professional)
      throw new NotFoundException('Professional profile not found');
    if (professional.accountId === actorAccountId)
      throw new ForbiddenException(
        'You cannot revoke your own credential. An independent authorized reviewer is required.',
      );
    if (!['VERIFIED', 'EXPIRED', 'REVOKED'].includes(credential.status))
      throw new ConflictException(
        'Only a previously verified credential can be revoked',
      );
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM credentials.credentials WHERE id = ${credentialId}::uuid FOR UPDATE`;
      const current = await tx.credential.findUniqueOrThrow({
        where: { id: credentialId },
        select: { status: true },
      });
      const changed = await tx.credential.updateMany({
        where: { id: credentialId, status: { in: ['VERIFIED', 'EXPIRED'] } },
        data: { status: 'REVOKED' },
      });
      if (!changed.count) {
        const replay = await tx.credentialLifecycleHistory.findFirst({
          where: { credentialId, toStatus: 'REVOKED' },
          orderBy: { createdAt: 'desc' },
        });
        if (
          replay?.actorAccountId === actorAccountId &&
          replay.reason === reason &&
          replay.source === source &&
          replay.verificationRequestId === (verificationRequestId ?? null)
        )
          return tx.credential.findUniqueOrThrow({
            where: { id: credentialId },
            select: credentialSelect,
          });
        throw new ConflictException(
          'This credential has already been revoked or changed. Refresh its history.',
        );
      }
      const history = await tx.credentialLifecycleHistory.create({
        data: {
          credentialId,
          actorAccountId,
          fromStatus: current.status,
          toStatus: 'REVOKED',
          reason,
          source,
          verificationRequestId,
        },
      });
      await this.audit.recordInTransaction(tx, {
        actorId: actorAccountId,
        action: 'credential.revoked',
        resourceType: 'credential',
        resourceId: credentialId,
        occurredAt: now.toISOString(),
        correlationId,
        changes: {
          status: { from: history.fromStatus, to: 'REVOKED' },
          lifecycleHistoryId: history.id,
          source,
        },
      });
      await this.outbox.enqueue(tx, [
        {
          id: randomUUID(),
          name: 'CredentialRevoked',
          version: 1,
          aggregateId: credentialId,
          occurredAt: now.toISOString(),
          correlationId,
          payload: {
            credentialId,
            professionalProfileId: credential.professionalProfileId,
            lifecycleHistoryId: history.id,
          },
        },
      ]);
      await this.notifications.enqueue(tx, [professional.accountId], {
        kind: 'CREDENTIAL_REVOKED',
        title: 'Credential verification revoked',
        message:
          'A governed decision changed your credential validity. Open your wallet to review the reason and history.',
        resourceType: 'credential',
        resourceId: credentialId,
      });
      return tx.credential.findUniqueOrThrow({
        where: { id: credentialId },
        select: credentialSelect,
      });
    });
  }

  async expireDue(now = new Date()) {
    if (!Number.isFinite(now.getTime()))
      throw new BadRequestException(
        'A valid expiry evaluation date is required',
      );
    const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const credentials = await this.prisma.credential.findMany({
      where: { status: 'VERIFIED', expiryDate: { lt: today } },
      select: { id: true, professionalProfileId: true, expiryDate: true },
      orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    let count = 0;
    for (const credential of credentials) {
      const professional = await this.professionals.findSummary(
        credential.professionalProfileId,
      );
      if (!professional) continue;
      count += await this.prisma.$transaction(async (tx) => {
        const updated = await tx.credential.updateMany({
          where: {
            id: credential.id,
            status: 'VERIFIED',
            expiryDate: { lt: today },
          },
          data: { status: 'EXPIRED' },
        });
        if (!updated.count) return 0;
        const reason = `Expired after ${credential.expiryDate!.toISOString().slice(0, 10)}; valid through that UTC date.`;
        const history = await tx.credentialLifecycleHistory.create({
          data: {
            credentialId: credential.id,
            actorAccountId: null,
            fromStatus: 'VERIFIED',
            toStatus: 'EXPIRED',
            source: 'EXPIRY_WORKER',
            reason,
          },
        });
        const correlationId = randomUUID();
        await this.audit.recordInTransaction(tx, {
          actorId: 'system:credential-expiry',
          action: 'credential.expired',
          resourceType: 'credential',
          resourceId: credential.id,
          occurredAt: now.toISOString(),
          correlationId,
          changes: {
            status: { from: 'VERIFIED', to: 'EXPIRED' },
            lifecycleHistoryId: history.id,
          },
        });
        await this.outbox.enqueue(tx, [
          {
            id: randomUUID(),
            name: 'CredentialExpired',
            version: 1,
            aggregateId: credential.id,
            occurredAt: now.toISOString(),
            correlationId,
            payload: {
              credentialId: credential.id,
              professionalProfileId: credential.professionalProfileId,
              lifecycleHistoryId: history.id,
            },
          },
        ]);
        await this.notifications.enqueue(tx, [professional.accountId], {
          kind: 'CREDENTIAL_EXPIRED',
          title: 'Credential expired',
          message:
            'A credential passed its recorded expiry date. Open your wallet for the validity history and renewal guidance.',
          resourceType: 'credential',
          resourceId: credential.id,
        });
        return 1;
      });
    }
    return count;
  }

  async createMine(
    accountId: string,
    dto: CreateCredentialDto,
    correlationId: string,
  ) {
    const professional = await this.requireProfessional(accountId);
    const issueDate = this.parseDate(dto.issueDate);
    const expiryDate = dto.expiryDate ? this.parseDate(dto.expiryDate) : null;
    if (expiryDate && expiryDate <= issueDate) {
      throw new BadRequestException('Expiry date must be after issue date');
    }

    const id = randomUUID();
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const credential = await transaction.credential.create({
        data: {
          id,
          professionalProfileId: professional.id,
          typeCode: dto.typeCode,
          title: dto.title.trim(),
          issuingOrganization: dto.issuingOrganization.trim(),
          countryCode: dto.countryCode.toUpperCase(),
          issueDate,
          expiryDate,
        },
        select: credentialSelect,
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'credential.created',
        resourceType: 'credential',
        resourceId: id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { status: { to: 'DRAFT' }, typeCode: dto.typeCode },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'CredentialCreated',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: id,
          correlationId,
          payload: {
            credentialId: id,
            professionalProfileId: professional.id,
            typeCode: dto.typeCode,
          },
        },
      ]);
      return credential;
    });
  }

  async submitMine(
    accountId: string,
    credentialId: string,
    correlationId: string,
  ) {
    const professional = await this.requireProfessional(accountId);
    const credential = await this.prisma.credential.findFirst({
      where: { id: credentialId, professionalProfileId: professional.id },
      select: credentialSelect,
    });
    if (!credential) throw new NotFoundException('Credential not found');
    if (credential.status === 'SUBMITTED') return credential;
    if (credential.status !== 'DRAFT') {
      throw new ConflictException('Credential cannot be submitted');
    }

    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const submitted = await transaction.credential.update({
        where: { id: credentialId },
        data: { status: 'SUBMITTED', submittedAt: occurredAt },
        select: credentialSelect,
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'credential.submitted',
        resourceType: 'credential',
        resourceId: credentialId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { status: { from: 'DRAFT', to: 'SUBMITTED' } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'CredentialSubmitted',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: credentialId,
          correlationId,
          payload: {
            credentialId,
            professionalProfileId: professional.id,
          },
        },
      ]);
      return submitted;
    });
  }

  private async requireProfessional(accountId: string) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional) {
      throw new NotFoundException('Professional profile not found');
    }
    return professional;
  }

  private parseDate(value: string) {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  }
}
