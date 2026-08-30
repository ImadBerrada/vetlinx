import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import {
  OUTBOX_WRITER,
  type OutboxWriter,
} from '../../platform/events/outbox-writer.port';
import { PrismaService } from '../../platform/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateLicencePathwayDto,
  CreateLicenceTypeDto,
  CreateLicensingAuthorityDto,
  CreateLicensingJurisdictionDto,
  CreatePathwayVersionDto,
  PathwayRequirementDto,
  UpdatePathwayVersionDto,
} from './dto/licensing-admin.dto';
import type {
  LicensingPublicApi,
  LicensingReadiness,
} from './licensing.public';
import { assertPathwayVersionTransition } from './licensing-rules';
import type { PathwayVersionStatus } from './licensing.types';

type VersionCommand = 'submit' | 'publish' | 'supersede';

@Injectable()
export class LicensingService implements LicensingPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
  ) {}

  createJurisdiction(
    accountId: string,
    dto: CreateLicensingJurisdictionDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = 'create-jurisdiction';
    return this.idempotent(
      accountId,
      operation,
      idempotencyKey,
      dto,
      (resourceId) =>
        this.prisma.licensingJurisdiction.findUniqueOrThrow({
          where: { id: resourceId },
        }),
      async (transaction, requestHash) => {
        const jurisdiction = await transaction.licensingJurisdiction.create({
          data: dto,
        });
        await this.recordCreate(
          transaction,
          accountId,
          correlationId,
          'jurisdiction',
          jurisdiction.id,
          dto,
        );
        await this.saveReceipt(
          transaction,
          accountId,
          operation,
          idempotencyKey,
          requestHash,
          jurisdiction.id,
          201,
        );
        return jurisdiction;
      },
    );
  }

  createAuthority(
    accountId: string,
    dto: CreateLicensingAuthorityDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = 'create-authority';
    return this.idempotent(
      accountId,
      operation,
      idempotencyKey,
      dto,
      (resourceId) =>
        this.prisma.licensingAuthority.findUniqueOrThrow({
          where: { id: resourceId },
        }),
      async (transaction, requestHash) => {
        await this.requireJurisdiction(transaction, dto.jurisdictionId);
        const authority = await transaction.licensingAuthority.create({
          data: dto,
        });
        await this.recordCreate(
          transaction,
          accountId,
          correlationId,
          'licensing_authority',
          authority.id,
          dto,
        );
        await this.saveReceipt(
          transaction,
          accountId,
          operation,
          idempotencyKey,
          requestHash,
          authority.id,
          201,
        );
        return authority;
      },
    );
  }

  createLicenceType(
    accountId: string,
    dto: CreateLicenceTypeDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = 'create-licence-type';
    return this.idempotent(
      accountId,
      operation,
      idempotencyKey,
      dto,
      (resourceId) =>
        this.prisma.licenceType.findUniqueOrThrow({
          where: { id: resourceId },
        }),
      async (transaction, requestHash) => {
        const licenceType = await transaction.licenceType.create({
          data: dto,
        });
        await this.recordCreate(
          transaction,
          accountId,
          correlationId,
          'licence_type',
          licenceType.id,
          dto,
        );
        await this.saveReceipt(
          transaction,
          accountId,
          operation,
          idempotencyKey,
          requestHash,
          licenceType.id,
          201,
        );
        return licenceType;
      },
    );
  }

  createPathway(
    accountId: string,
    dto: CreateLicencePathwayDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = 'create-pathway';
    this.validateVersionContent(dto);
    return this.idempotent(
      accountId,
      operation,
      idempotencyKey,
      dto,
      async (resourceId) => {
        const [pathwayId, versionId] = resourceId.split(':');
        const version =
          await this.prisma.licencePathwayVersion.findUniqueOrThrow({
            where: { id: versionId },
          });
        return {
          id: pathwayId,
          versionId: version.id,
          version: version.version,
          status: version.status,
        };
      },
      async (transaction, requestHash) => {
        await this.validatePathwayReferences(transaction, dto);
        const pathway = await transaction.licencePathway.create({
          data: {
            jurisdictionId: dto.jurisdictionId,
            authorityId: dto.authorityId,
            licenceTypeId: dto.licenceTypeId,
            slug: dto.slug,
          },
        });
        const version = await transaction.licencePathwayVersion.create({
          data: {
            pathwayId: pathway.id,
            version: 1,
            ...this.versionData(dto),
            requirements: { create: this.requirementData(dto.requirements) },
          },
        });
        await this.recordCreate(
          transaction,
          accountId,
          correlationId,
          'licence_pathway',
          pathway.id,
          {
            jurisdictionId: dto.jurisdictionId,
            authorityId: dto.authorityId,
            licenceTypeId: dto.licenceTypeId,
            pathwayVersionId: version.id,
            version: 1,
          },
        );
        await this.saveReceipt(
          transaction,
          accountId,
          operation,
          idempotencyKey,
          requestHash,
          `${pathway.id}:${version.id}`,
          201,
        );
        return {
          id: pathway.id,
          versionId: version.id,
          version: version.version,
          status: version.status,
        };
      },
    );
  }

  createPathwayVersion(
    accountId: string,
    pathwayId: string,
    dto: CreatePathwayVersionDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = `create-pathway-version:${pathwayId}`;
    this.validateVersionContent(dto);
    return this.idempotent(
      accountId,
      operation,
      idempotencyKey,
      dto,
      (resourceId) =>
        this.prisma.licencePathwayVersion.findUniqueOrThrow({
          where: { id: resourceId },
          include: { requirements: { orderBy: { position: 'asc' } } },
        }),
      async (transaction, requestHash) => {
        const pathway = await transaction.licencePathway.findUnique({
          where: { id: pathwayId },
          select: { id: true },
        });
        if (!pathway) throw new NotFoundException('Licence pathway not found');
        const latest = await transaction.licencePathwayVersion.aggregate({
          where: { pathwayId },
          _max: { version: true },
        });
        const version = await transaction.licencePathwayVersion.create({
          data: {
            pathwayId,
            version: (latest._max.version ?? 0) + 1,
            ...this.versionData(dto),
            requirements: { create: this.requirementData(dto.requirements) },
          },
          include: { requirements: { orderBy: { position: 'asc' } } },
        });
        await this.recordCreate(
          transaction,
          accountId,
          correlationId,
          'licence_pathway_version',
          version.id,
          { pathwayId, version: version.version },
        );
        await this.saveReceipt(
          transaction,
          accountId,
          operation,
          idempotencyKey,
          requestHash,
          version.id,
          201,
        );
        return version;
      },
    );
  }

  async updatePathwayVersion(
    accountId: string,
    versionId: string,
    dto: UpdatePathwayVersionDto,
    correlationId: string,
  ) {
    const current = await this.prisma.licencePathwayVersion.findUnique({
      where: { id: versionId },
    });
    if (!current) throw new NotFoundException('Pathway version not found');
    if (current.status !== 'DRAFT') {
      throw new ConflictException('Only draft pathway versions can be edited');
    }
    const merged = {
      sourceUrl: dto.sourceUrl ?? current.sourceUrl,
      sourceTitle: dto.sourceTitle ?? current.sourceTitle,
      effectiveFrom:
        dto.effectiveFrom ?? this.dateOnly(current.effectiveFrom) ?? undefined,
      effectiveTo:
        dto.effectiveTo ?? this.dateOnly(current.effectiveTo) ?? undefined,
      requirements: dto.requirements,
    };
    this.validateDates(merged.effectiveFrom, merged.effectiveTo);
    if (dto.requirements) this.validateRequirements(dto.requirements);

    return this.prisma.$transaction(async (transaction) => {
      if (dto.requirements) {
        await transaction.pathwayRequirement.deleteMany({
          where: { pathwayVersionId: versionId },
        });
      }
      const updated = await transaction.licencePathwayVersion.update({
        where: { id: versionId },
        data: {
          sourceUrl: dto.sourceUrl,
          sourceTitle: dto.sourceTitle,
          effectiveFrom: dto.effectiveFrom
            ? new Date(`${dto.effectiveFrom}T00:00:00.000Z`)
            : undefined,
          effectiveTo: dto.effectiveTo
            ? new Date(`${dto.effectiveTo}T00:00:00.000Z`)
            : undefined,
          requirements: dto.requirements
            ? { create: this.requirementData(dto.requirements) }
            : undefined,
        },
        include: { requirements: { orderBy: { position: 'asc' } } },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'licensing.pathway_version.updated',
        resourceType: 'licence_pathway_version',
        resourceId: versionId,
        occurredAt: new Date().toISOString(),
        correlationId,
        changes: { fields: Object.keys(dto) },
      });
      return updated;
    });
  }

  submitVersion(
    accountId: string,
    versionId: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.transitionVersion(
      accountId,
      versionId,
      'submit',
      'IN_REVIEW',
      idempotencyKey,
      correlationId,
    );
  }

  publishVersion(
    accountId: string,
    versionId: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.transitionVersion(
      accountId,
      versionId,
      'publish',
      'PUBLISHED',
      idempotencyKey,
      correlationId,
    );
  }

  supersedeVersion(
    accountId: string,
    versionId: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.transitionVersion(
      accountId,
      versionId,
      'supersede',
      'SUPERSEDED',
      idempotencyKey,
      correlationId,
    );
  }

  async findReadiness(
    accountId: string,
    enrollmentId: string,
  ): Promise<LicensingReadiness | null> {
    const enrollment = await this.prisma.pathwayEnrollment.findFirst({
      where: { id: enrollmentId, professional: { accountId } },
      include: {
        pathwayVersion: {
          include: { requirements: { select: { id: true, required: true } } },
        },
        requirementProgress: {
          select: { requirementId: true, state: true },
        },
      },
    });
    if (!enrollment) return null;
    const requiredIds = new Set(
      enrollment.pathwayVersion.requirements
        .filter(({ required }) => required)
        .map(({ id }) => id),
    );
    const requiredProgress = enrollment.requirementProgress.filter(
      ({ requirementId }) => requiredIds.has(requirementId),
    );
    const satisfied = requiredProgress.filter(
      ({ state }) => state === 'SATISFIED' || state === 'NOT_APPLICABLE',
    ).length;
    const needsReview = requiredProgress.filter(
      ({ state }) => state === 'NEEDS_REVIEW',
    ).length;
    const required = requiredIds.size;
    return {
      enrollmentId,
      status: enrollment.status,
      required,
      satisfied,
      needsReview,
      remaining: Math.max(0, required - satisfied),
      ready: required === satisfied,
    };
  }

  private async transitionVersion(
    accountId: string,
    versionId: string,
    command: VersionCommand,
    target: PathwayVersionStatus,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = `${command}-pathway-version`;
    return this.idempotent(
      accountId,
      operation,
      idempotencyKey,
      { versionId },
      (resourceId) => this.loadVersion(resourceId),
      async (transaction, requestHash) => {
        const current = await transaction.licencePathwayVersion.findUnique({
          where: { id: versionId },
          include: {
            requirements: true,
            pathway: {
              include: { jurisdiction: true, licenceType: true },
            },
          },
        });
        if (!current) throw new NotFoundException('Pathway version not found');
        try {
          assertPathwayVersionTransition(current.status, target);
        } catch (error) {
          throw new ConflictException(
            error instanceof Error ? error.message : 'Invalid transition',
          );
        }
        if (target === 'PUBLISHED' && current.requirements.length === 0) {
          throw new ConflictException(
            'A pathway version must contain requirements before publication',
          );
        }
        const occurredAt = new Date();
        const updated = await transaction.licencePathwayVersion.update({
          where: { id: versionId },
          data: {
            status: target,
            reviewedAt: target === 'PUBLISHED' ? occurredAt : undefined,
            reviewedByAccountId: target === 'PUBLISHED' ? accountId : undefined,
          },
          include: {
            requirements: { orderBy: { position: 'asc' } },
            pathway: {
              include: { jurisdiction: true, licenceType: true },
            },
          },
        });
        await this.audit.recordInTransaction(transaction, {
          actorId: accountId,
          action: `licensing.pathway_version.${command === 'submit' ? 'submitted' : target.toLowerCase()}`,
          resourceType: 'licence_pathway_version',
          resourceId: versionId,
          occurredAt: occurredAt.toISOString(),
          correlationId,
          changes: {
            transition: { from: current.status, to: target },
            source: {
              title: current.sourceTitle,
              url: current.sourceUrl,
            },
          },
        });
        const eventName =
          target === 'PUBLISHED'
            ? 'LicencePathwayPublished'
            : target === 'SUPERSEDED'
              ? 'LicencePathwaySuperseded'
              : 'LicencePathwaySubmitted';
        await this.outbox.enqueue(transaction, [
          {
            id: randomUUID(),
            name: eventName,
            version: 1,
            occurredAt: occurredAt.toISOString(),
            aggregateId: current.pathwayId,
            correlationId,
            payload: {
              pathwayId: current.pathwayId,
              pathwayVersionId: current.id,
              version: current.version,
              jurisdictionCode: current.pathway.jurisdiction.code,
              licenceTypeCode: current.pathway.licenceType.code,
            },
          },
        ]);
        await this.saveReceipt(
          transaction,
          accountId,
          operation,
          idempotencyKey,
          requestHash,
          versionId,
          200,
        );
        return updated;
      },
    );
  }

  private async idempotent<T>(
    accountId: string,
    operation: string,
    idempotencyKey: string,
    payload: unknown,
    load: (resourceId: string) => Promise<T>,
    execute: (
      transaction: Prisma.TransactionClient,
      requestHash: string,
    ) => Promise<T>,
  ): Promise<T> {
    const requestHash = this.requestHash(payload);
    const receipt = await this.prisma.licensingMutationReceipt.findUnique({
      where: {
        accountId_operation_idempotencyKey: {
          accountId,
          operation,
          idempotencyKey,
        },
      },
    });
    if (receipt) {
      if (receipt.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used for a different request',
        );
      }
      return load(receipt.resourceId);
    }
    return this.prisma.$transaction((transaction) =>
      execute(transaction, requestHash),
    );
  }

  private saveReceipt(
    transaction: Prisma.TransactionClient,
    accountId: string,
    operation: string,
    idempotencyKey: string,
    requestHash: string,
    resourceId: string,
    responseStatus: number,
  ) {
    return transaction.licensingMutationReceipt.create({
      data: {
        accountId,
        operation,
        idempotencyKey,
        requestHash,
        resourceId,
        responseStatus,
      },
    });
  }

  private async loadVersion(versionId: string) {
    return this.prisma.licencePathwayVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: {
        requirements: { orderBy: { position: 'asc' } },
        pathway: {
          include: { jurisdiction: true, authority: true, licenceType: true },
        },
      },
    });
  }

  private async validatePathwayReferences(
    transaction: Prisma.TransactionClient,
    dto: CreateLicencePathwayDto,
  ) {
    const [jurisdiction, authority, licenceType] = await Promise.all([
      transaction.licensingJurisdiction.findUnique({
        where: { id: dto.jurisdictionId },
      }),
      transaction.licensingAuthority.findUnique({
        where: { id: dto.authorityId },
      }),
      transaction.licenceType.findUnique({ where: { id: dto.licenceTypeId } }),
    ]);
    if (!jurisdiction || !authority || !licenceType) {
      throw new NotFoundException('Licensing catalogue reference not found');
    }
    if (authority.jurisdictionId !== jurisdiction.id) {
      throw new BadRequestException(
        'Licensing authority does not belong to the jurisdiction',
      );
    }
  }

  private async requireJurisdiction(
    transaction: Prisma.TransactionClient,
    jurisdictionId: string,
  ) {
    const jurisdiction = await transaction.licensingJurisdiction.findUnique({
      where: { id: jurisdictionId },
      select: { id: true },
    });
    if (!jurisdiction) {
      throw new NotFoundException('Licensing jurisdiction not found');
    }
  }

  private recordCreate(
    transaction: Prisma.TransactionClient,
    accountId: string,
    correlationId: string,
    resourceType: string,
    resourceId: string,
    changes: object,
  ) {
    return this.audit.recordInTransaction(transaction, {
      actorId: accountId,
      action: `licensing.${resourceType}.created`,
      resourceType,
      resourceId,
      occurredAt: new Date().toISOString(),
      correlationId,
      changes: changes as Record<string, unknown>,
    });
  }

  private versionData(dto: {
    sourceUrl: string;
    sourceTitle: string;
    effectiveFrom?: string;
    effectiveTo?: string;
  }) {
    return {
      sourceUrl: dto.sourceUrl,
      sourceTitle: dto.sourceTitle,
      effectiveFrom: dto.effectiveFrom
        ? new Date(`${dto.effectiveFrom}T00:00:00.000Z`)
        : undefined,
      effectiveTo: dto.effectiveTo
        ? new Date(`${dto.effectiveTo}T00:00:00.000Z`)
        : undefined,
    };
  }

  private requirementData(requirements: PathwayRequirementDto[]) {
    return requirements.map((requirement) => ({
      code: requirement.code,
      titleEn: requirement.titleEn,
      titleAr: requirement.titleAr,
      descriptionEn: requirement.descriptionEn,
      descriptionAr: requirement.descriptionAr,
      position: requirement.position,
      required: requirement.required,
      rule: requirement.rule as unknown as Prisma.InputJsonValue,
    }));
  }

  private validateVersionContent(dto: {
    effectiveFrom?: string;
    effectiveTo?: string;
    requirements: PathwayRequirementDto[];
  }) {
    this.validateDates(dto.effectiveFrom, dto.effectiveTo);
    this.validateRequirements(dto.requirements);
  }

  private validateDates(effectiveFrom?: string, effectiveTo?: string) {
    if (
      effectiveFrom &&
      effectiveTo &&
      new Date(effectiveTo).getTime() < new Date(effectiveFrom).getTime()
    ) {
      throw new BadRequestException(
        'Effective end date cannot precede the start date',
      );
    }
  }

  private validateRequirements(requirements: PathwayRequirementDto[]) {
    const codes = new Set<string>();
    const positions = new Set<number>();
    for (const requirement of requirements) {
      if (codes.has(requirement.code) || positions.has(requirement.position)) {
        throw new BadRequestException(
          'Requirement codes and positions must be unique',
        );
      }
      codes.add(requirement.code);
      positions.add(requirement.position);
    }
  }

  private requestHash(payload: unknown) {
    return createHash('sha256')
      .update(JSON.stringify(this.sortForHash(payload)))
      .digest('hex');
  }

  private sortForHash(value: unknown): unknown {
    if (Array.isArray(value))
      return value.map((item) => this.sortForHash(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.sortForHash(item)]),
      );
    }
    return value;
  }

  private dateOnly(value: Date | null) {
    return value?.toISOString().slice(0, 10) ?? null;
  }
}
