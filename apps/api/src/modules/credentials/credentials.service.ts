import {
  BadRequestException,
  ConflictException,
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

const credentialSelect = {
  id: true,
  professionalProfileId: true,
  typeCode: true,
  title: true,
  issuingOrganization: true,
  countryCode: true,
  issueDate: true,
  expiryDate: true,
  status: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CredentialsService implements CredentialsPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(PROFESSIONALS_PUBLIC_API)
    private readonly professionals: ProfessionalsPublicApi,
  ) {}

  async listMine(accountId: string) {
    const professional = await this.requireProfessional(accountId);
    return this.prisma.credential.findMany({
      where: { professionalProfileId: professional.id },
      select: credentialSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOwnedByAccount(accountId: string, credentialId: string) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional) return null;
    return this.prisma.credential.findFirst({
      where: { id: credentialId, professionalProfileId: professional.id },
      select: { id: true, professionalProfileId: true, status: true },
    });
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
