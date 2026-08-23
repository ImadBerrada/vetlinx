import {
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
import type { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';

const profileSelect = {
  id: true,
  displayName: true,
  countryCode: true,
  status: true,
  headline: true,
  summary: true,
  publicSlug: true,
  visibility: true,
  contactVisibility: true,
  specialtyCodes: true,
  speciesCodes: true,
  languageCodes: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
  ) {}

  async findSummary(professionalId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalId },
      select: { id: true, accountId: true, displayName: true, status: true },
    });
    return profile ? this.toPublicSummary(profile) : null;
  }

  async findByAccountId(accountId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { accountId },
      select: { id: true, accountId: true, displayName: true, status: true },
    });
    return profile ? this.toPublicSummary(profile) : null;
  }

  getMine(accountId: string) {
    return this.prisma.professionalProfile.findUnique({
      where: { accountId },
      select: profileSelect,
    });
  }

  async createMine(
    accountId: string,
    displayNameInput: string,
    countryCodeInput: string,
    correlationId: string,
  ) {
    const existing = await this.prisma.professionalProfile.findUnique({
      where: { accountId },
    });
    if (existing) {
      throw new ConflictException('A professional profile already exists');
    }

    const id = randomUUID();
    const displayName = displayNameInput.trim();
    const countryCode = countryCodeInput.toUpperCase();
    const occurredAt = new Date();
    const publicSlug = this.createSlug(displayName, id);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const profile = await transaction.professionalProfile.create({
          data: { id, accountId, displayName, countryCode, publicSlug },
          select: profileSelect,
        });
        await this.audit.recordInTransaction(transaction, {
          actorId: accountId,
          action: 'professional.profile.created',
          resourceType: 'professional_profile',
          resourceId: id,
          occurredAt: occurredAt.toISOString(),
          correlationId,
          changes: { status: { to: 'DRAFT' } },
        });
        await this.outbox.enqueue(transaction, [
          {
            id: randomUUID(),
            name: 'ProfessionalProfileCreated',
            version: 1,
            occurredAt: occurredAt.toISOString(),
            aggregateId: id,
            correlationId,
            payload: { professionalProfileId: id, accountId, countryCode },
          },
        ]);
        return profile;
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('A professional profile already exists');
      }
      throw error;
    }
  }

  async updateMine(
    accountId: string,
    dto: UpdateProfessionalProfileDto,
    correlationId: string,
  ) {
    const existing = await this.prisma.professionalProfile.findUnique({
      where: { accountId },
      select: { id: true, publicSlug: true, visibility: true },
    });
    if (!existing)
      throw new NotFoundException('Professional profile not found');
    if (dto.visibility && dto.visibility !== 'PRIVATE') {
      const verifiedCredential = await this.prisma.credential.findFirst({
        where: { professionalProfileId: existing.id, status: 'VERIFIED' },
        select: { id: true },
      });
      if (!verifiedCredential)
        throw new ConflictException(
          'At least one verified credential is required before publishing a portfolio',
        );
    }
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.professionalProfile.update({
        where: { id: existing.id },
        data: {
          ...(dto.displayName ? { displayName: dto.displayName.trim() } : {}),
          ...(dto.countryCode
            ? { countryCode: dto.countryCode.toUpperCase() }
            : {}),
          ...(dto.headline !== undefined
            ? { headline: dto.headline.trim() || null }
            : {}),
          ...(dto.summary !== undefined
            ? { summary: dto.summary.trim() || null }
            : {}),
          ...(dto.visibility ? { visibility: dto.visibility } : {}),
          ...(dto.contactVisibility
            ? { contactVisibility: dto.contactVisibility }
            : {}),
          ...(dto.specialtyCodes
            ? { specialtyCodes: this.normalizeCodes(dto.specialtyCodes) }
            : {}),
          ...(dto.speciesCodes
            ? { speciesCodes: this.normalizeCodes(dto.speciesCodes) }
            : {}),
          ...(dto.languageCodes
            ? { languageCodes: this.normalizeCodes(dto.languageCodes) }
            : {}),
          ...(!existing.publicSlug
            ? {
                publicSlug: this.createSlug(
                  dto.displayName ?? 'professional',
                  existing.id,
                ),
              }
            : {}),
        },
        select: profileSelect,
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'professional.profile.updated',
        resourceType: 'professional_profile',
        resourceId: existing.id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: {
          visibility: dto.visibility
            ? { from: existing.visibility, to: dto.visibility }
            : undefined,
        },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'ProfessionalProfileUpdated',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: existing.id,
          correlationId,
          payload: {
            professionalProfileId: existing.id,
            fields: Object.keys(dto),
          },
        },
      ]);
      return updated;
    });
  }

  private createSlug(displayName: string, id: string) {
    const base =
      displayName
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'professional';
    return `${base.slice(0, 140)}-${id.replaceAll('-', '').slice(0, 8)}`;
  }
  private normalizeCodes(values: string[]) {
    return [
      ...new Set(
        values.map((value) => value.trim().toUpperCase()).filter(Boolean),
      ),
    ];
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private toPublicSummary(profile: {
    id: string;
    accountId: string;
    displayName: string;
    status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED';
  }) {
    return {
      id: profile.id,
      accountId: profile.accountId,
      displayName: profile.displayName,
      profileStatus:
        profile.status === 'ACTIVE'
          ? ('published' as const)
          : profile.status === 'SUSPENDED'
            ? ('suspended' as const)
            : ('draft' as const),
    };
  }
}
