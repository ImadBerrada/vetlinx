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
import {
  CREDENTIALS_PUBLIC_API,
  type CredentialsPublicApi,
} from '../credentials/credentials.public';
import {
  PROFESSIONALS_PUBLIC_API,
  type ProfessionalsPublicApi,
} from '../professionals/professionals.public';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminPathwaySearchQueryDto,
  CreateLicencePathwayDto,
  CreateLicenceTypeDto,
  CreateLicensingAuthorityDto,
  CreateLicensingJurisdictionDto,
  CreatePathwayVersionDto,
  PathwayRequirementDto,
  UpdatePathwayVersionDto,
} from './dto/licensing-admin.dto';
import type {
  CreateExternalLicenceApplicationDto,
  PathwaySearchQueryDto,
  UpdateExternalLicenceApplicationDto,
  UpdateLicensingReminderPreferencesDto,
} from './dto/licensing-professional.dto';
import type {
  LicensingPublicApi,
  LicensingReadiness,
} from './licensing.public';
import {
  assertEnrollmentTransition,
  assertPathwayVersionTransition,
  evaluateRequirement,
} from './licensing-rules';
import type {
  PathwayVersionStatus,
  RequirementProgressState,
  RequirementRule,
} from './licensing.types';

type VersionCommand = 'submit' | 'publish' | 'supersede';

type ProgressContext = {
  enrollmentId: string;
  requirement: { id: string; rule: Prisma.JsonValue };
  progress: {
    id: string;
    state: RequirementProgressState;
    linkedCredentialId: string | null;
    note: string | null;
  };
};

@Injectable()
export class LicensingService implements LicensingPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(CREDENTIALS_PUBLIC_API)
    private readonly credentials: CredentialsPublicApi,
    @Inject(PROFESSIONALS_PUBLIC_API)
    private readonly professionals: ProfessionalsPublicApi,
    private readonly notifications: NotificationsService,
  ) {}

  listJurisdictions() {
    return this.prisma.licensingJurisdiction.findMany({
      where: { active: true },
      select: { id: true, code: true, nameEn: true, nameAr: true },
      orderBy: { nameEn: 'asc' },
    });
  }

  listAdminPathways(query: AdminPathwaySearchQueryDto) {
    return this.prisma.licencePathway.findMany({
      where: {
        jurisdiction: { code: query.jurisdictionCode },
        licenceType: { code: query.licenceTypeCode },
        versions: query.status ? { some: { status: query.status } } : undefined,
      },
      include: {
        jurisdiction: true,
        authority: true,
        licenceType: true,
        versions: {
          where: query.status ? { status: query.status } : undefined,
          orderBy: { version: 'desc' },
          include: {
            requirements: { orderBy: { position: 'asc' } },
          },
        },
      },
      orderBy: [{ jurisdiction: { nameEn: 'asc' } }, { updatedAt: 'desc' }],
    });
  }

  async getAdminPathway(pathwayId: string) {
    const pathway = await this.prisma.licencePathway.findUnique({
      where: { id: pathwayId },
      include: {
        jurisdiction: true,
        authority: true,
        licenceType: true,
        versions: {
          orderBy: { version: 'desc' },
          include: {
            requirements: { orderBy: { position: 'asc' } },
          },
        },
      },
    });
    if (!pathway) throw new NotFoundException('Licence pathway not found');
    return pathway;
  }

  listPathways(query: PathwaySearchQueryDto) {
    const effective = this.effectiveVersionWhere();
    return this.prisma.licencePathway.findMany({
      where: {
        active: true,
        jurisdiction: {
          active: true,
          code: query.jurisdictionCode,
        },
        licenceType: { active: true, code: query.licenceTypeCode },
        authority: { active: true },
        versions: { some: effective },
      },
      select: {
        id: true,
        slug: true,
        jurisdiction: {
          select: { code: true, nameEn: true, nameAr: true },
        },
        authority: {
          select: {
            code: true,
            nameEn: true,
            nameAr: true,
            websiteUrl: true,
          },
        },
        licenceType: {
          select: {
            code: true,
            nameEn: true,
            nameAr: true,
            professionalTitleCode: true,
          },
        },
        versions: {
          where: effective,
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            effectiveFrom: true,
            effectiveTo: true,
            sourceUrl: true,
            sourceTitle: true,
          },
        },
      },
      orderBy: [{ jurisdiction: { nameEn: 'asc' } }, { slug: 'asc' }],
    });
  }

  async getPathway(pathwayId: string) {
    const pathway = await this.findPublicPathway(pathwayId);
    if (!pathway) throw new NotFoundException('Licence pathway not found');
    return pathway;
  }

  async previewEligibility(accountId: string, pathwayId: string) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional) {
      throw new NotFoundException('Professional profile not found');
    }
    const pathway = await this.prisma.licencePathway.findUnique({
      where: { id: pathwayId, active: true },
      include: {
        jurisdiction: true,
        authority: true,
        licenceType: true,
        versions: {
          where: { status: 'PUBLISHED' },
          orderBy: { version: 'desc' },
          include: { requirements: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!pathway) throw new NotFoundException('Licence pathway not found');
    const version = pathway.versions.find((candidate) =>
      this.isVersionEffective(candidate.effectiveFrom, candidate.effectiveTo),
    );
    if (!version) {
      throw new NotFoundException(
        'No currently effective pathway version is available',
      );
    }
    const evidence = (
      await this.credentials.listOwnedEvidence(accountId)
    ).filter(
      ({ professionalProfileId }) => professionalProfileId === professional.id,
    );
    const requirements = version.requirements.map((requirement) => ({
      id: requirement.id,
      code: requirement.code,
      titleEn: requirement.titleEn,
      titleAr: requirement.titleAr,
      descriptionEn: requirement.descriptionEn,
      descriptionAr: requirement.descriptionAr,
      position: requirement.position,
      required: requirement.required,
      ...evaluateRequirement(this.requirementRule(requirement.rule), evidence),
    }));
    const required = requirements.filter((requirement) => requirement.required);
    const satisfied = required.filter(
      ({ state }) => state === 'SATISFIED' || state === 'NOT_APPLICABLE',
    ).length;
    return {
      pathwayId: pathway.id,
      pathwayVersionId: version.id,
      version: version.version,
      requirements,
      summary: {
        required: required.length,
        satisfied,
        remaining: required.length - satisfied,
        ready: required.length === satisfied,
      },
    };
  }

  async enroll(
    accountId: string,
    pathwayId: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = 'enroll-pathway';
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional) {
      throw new NotFoundException('Professional profile not found');
    }
    const preview = await this.previewEligibility(accountId, pathwayId);
    const enrollment = await this.idempotent(
      accountId,
      operation,
      idempotencyKey,
      { pathwayId },
      (resourceId) =>
        this.prisma.pathwayEnrollment.findUniqueOrThrow({
          where: { id: resourceId },
        }),
      async (transaction, requestHash) => {
        const duplicate = await transaction.pathwayEnrollment.findFirst({
          where: {
            professionalProfileId: professional.id,
            status: { in: ['ACTIVE', 'SUBMITTED_EXTERNALLY'] },
            pathwayVersion: { pathwayId },
          },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException(
            'An active enrollment already exists for this pathway',
          );
        }
        const occurredAt = new Date();
        const enrollment = await transaction.pathwayEnrollment.create({
          data: {
            professionalProfileId: professional.id,
            pathwayVersionId: preview.pathwayVersionId,
            requirementProgress: {
              create: preview.requirements.map((requirement) => ({
                requirementId: requirement.id,
                state: requirement.state,
                linkedCredentialId: requirement.credentialId,
                note: requirement.explanation,
                evaluatedAt: occurredAt,
              })),
            },
          },
          include: this.enrollmentInclude(),
        });
        await this.audit.recordInTransaction(transaction, {
          actorId: accountId,
          action: 'licensing.pathway_enrollment.started',
          resourceType: 'pathway_enrollment',
          resourceId: enrollment.id,
          occurredAt: occurredAt.toISOString(),
          correlationId,
          changes: {
            pathwayId,
            pathwayVersionId: preview.pathwayVersionId,
            version: preview.version,
            status: { to: 'ACTIVE' },
          },
        });
        await this.outbox.enqueue(transaction, [
          {
            id: randomUUID(),
            name: 'PathwayEnrollmentStarted',
            version: 1,
            occurredAt: occurredAt.toISOString(),
            aggregateId: enrollment.id,
            correlationId,
            payload: {
              enrollmentId: enrollment.id,
              professionalProfileId: professional.id,
              pathwayId,
              pathwayVersionId: preview.pathwayVersionId,
              version: preview.version,
            },
          },
        ]);
        await this.saveReceipt(
          transaction,
          accountId,
          operation,
          idempotencyKey,
          requestHash,
          enrollment.id,
          201,
        );
        return enrollment;
      },
    );
    return this.getOwnedEnrollment(accountId, enrollment.id);
  }

  async listMyEnrollments(accountId: string) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional) return [];
    const enrollments = await this.prisma.pathwayEnrollment.findMany({
      where: { professionalProfileId: professional.id },
      select: { id: true },
      orderBy: { startedAt: 'desc' },
    });
    return Promise.all(
      enrollments.map(({ id }) => this.getOwnedEnrollment(accountId, id)),
    );
  }

  async getOwnedEnrollment(accountId: string, enrollmentId: string) {
    await this.refreshLinkedEvidence(accountId, enrollmentId);
    const enrollment = await this.prisma.pathwayEnrollment.findFirst({
      where: { id: enrollmentId, professional: { accountId } },
      include: this.enrollmentInclude(),
    });
    if (!enrollment)
      throw new NotFoundException('Pathway enrollment not found');
    const requirements = enrollment.pathwayVersion.requirements.map(
      (requirement) => {
        const progress = enrollment.requirementProgress.find(
          ({ requirementId }) => requirementId === requirement.id,
        );
        return {
          id: requirement.id,
          code: requirement.code,
          titleEn: requirement.titleEn,
          titleAr: requirement.titleAr,
          descriptionEn: requirement.descriptionEn,
          descriptionAr: requirement.descriptionAr,
          position: requirement.position,
          required: requirement.required,
          state: progress?.state ?? 'MISSING',
          credentialId: progress?.linkedCredentialId ?? undefined,
          note: progress?.note ?? undefined,
          evaluatedAt: progress?.evaluatedAt ?? undefined,
        };
      },
    );
    const required = requirements.filter((requirement) => requirement.required);
    const satisfied = required.filter(
      ({ state }) => state === 'SATISFIED' || state === 'NOT_APPLICABLE',
    ).length;
    return {
      ...enrollment,
      requirements,
      readiness: {
        required: required.length,
        satisfied,
        needsReview: required.filter(({ state }) => state === 'NEEDS_REVIEW')
          .length,
        remaining: required.length - satisfied,
        ready: required.length === satisfied,
      },
    };
  }

  async linkCredential(
    accountId: string,
    enrollmentId: string,
    requirementId: string,
    credentialId: string,
    correlationId: string,
  ) {
    const context = await this.requireProgressContext(
      accountId,
      enrollmentId,
      requirementId,
    );
    const owned = await this.credentials.findOwnedByAccount(
      accountId,
      credentialId,
    );
    if (!owned) throw new NotFoundException('Credential not found');
    const evidence = (await this.credentials.listOwnedEvidence(accountId)).find(
      ({ id }) => id === credentialId,
    );
    if (!evidence) throw new NotFoundException('Credential not found');
    const evaluation = evaluateRequirement(
      this.requirementRule(context.requirement.rule),
      [evidence],
    );
    if (evaluation.state === 'MISSING') {
      throw new BadRequestException(
        'Credential does not satisfy this pathway requirement',
      );
    }
    return this.changeRequirementProgress(
      accountId,
      context,
      evaluation.state,
      evaluation.credentialId,
      evaluation.explanation,
      correlationId,
    );
  }

  async unlinkCredential(
    accountId: string,
    enrollmentId: string,
    requirementId: string,
    correlationId: string,
  ) {
    const context = await this.requireProgressContext(
      accountId,
      enrollmentId,
      requirementId,
    );
    return this.changeRequirementProgress(
      accountId,
      context,
      'MISSING',
      undefined,
      'No credential is linked to this requirement.',
      correlationId,
    );
  }

  async setRequirementInProgress(
    accountId: string,
    enrollmentId: string,
    requirementId: string,
    note: string | undefined,
    correlationId: string,
  ) {
    const context = await this.requireProgressContext(
      accountId,
      enrollmentId,
      requirementId,
    );
    return this.changeRequirementProgress(
      accountId,
      context,
      'IN_PROGRESS',
      undefined,
      note?.trim() || 'Professional marked this requirement as in progress.',
      correlationId,
    );
  }

  async createExternalApplication(
    accountId: string,
    enrollmentId: string,
    dto: CreateExternalLicenceApplicationDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = 'create-external-application';
    return this.idempotent(
      accountId,
      operation,
      idempotencyKey,
      { enrollmentId, ...dto },
      (resourceId) =>
        this.prisma.externalLicenceApplication.findUniqueOrThrow({
          where: { id: resourceId },
        }),
      async (transaction, requestHash) => {
        const current = await transaction.pathwayEnrollment.findFirst({
          where: { id: enrollmentId, professional: { accountId } },
          select: { id: true, status: true },
        });
        if (!current) {
          throw new NotFoundException('Pathway enrollment not found');
        }
        if (current.status !== 'ACTIVE') {
          throw new ConflictException(
            'Only an active enrollment can be submitted externally',
          );
        }
        const readiness = await this.findReadiness(accountId, enrollmentId);
        if (!readiness?.ready) {
          throw new ConflictException(
            'All required pathway evidence must be satisfied before submission',
          );
        }
        const existing =
          await transaction.externalLicenceApplication.findUnique({
            where: { enrollmentId },
          });
        if (existing) {
          throw new ConflictException(
            'An external application already exists for this enrollment',
          );
        }
        const occurredAt = new Date();
        const application = await transaction.externalLicenceApplication.create(
          {
            data: {
              enrollmentId,
              authorityReference: dto.authorityReference.trim(),
              submittedAt: this.parseDate(dto.submittedAt),
              status: dto.status,
              verificationSource: 'USER_REPORTED',
              lastReportedAt: occurredAt,
            },
          },
        );
        await transaction.pathwayEnrollment.update({
          where: { id: enrollmentId },
          data: {
            status: 'SUBMITTED_EXTERNALLY',
            submittedExternallyAt: occurredAt,
          },
        });
        await this.audit.recordInTransaction(transaction, {
          actorId: accountId,
          action: 'licensing.external_application.reported',
          resourceType: 'external_licence_application',
          resourceId: application.id,
          occurredAt: occurredAt.toISOString(),
          correlationId,
          changes: {
            enrollmentId,
            verificationSource: 'USER_REPORTED',
            status: { to: dto.status },
          },
        });
        await this.outbox.enqueue(transaction, [
          {
            id: randomUUID(),
            name: 'ExternalLicenceApplicationReported',
            version: 1,
            occurredAt: occurredAt.toISOString(),
            aggregateId: enrollmentId,
            correlationId,
            payload: {
              enrollmentId,
              externalApplicationId: application.id,
              authorityReference: application.authorityReference,
              status: application.status,
              verificationSource: application.verificationSource,
            },
          },
        ]);
        await this.saveReceipt(
          transaction,
          accountId,
          operation,
          idempotencyKey,
          requestHash,
          application.id,
          201,
        );
        return application;
      },
    );
  }

  async updateExternalApplication(
    accountId: string,
    enrollmentId: string,
    dto: UpdateExternalLicenceApplicationDto,
    correlationId: string,
  ) {
    const enrollment = await this.prisma.pathwayEnrollment.findFirst({
      where: { id: enrollmentId, professional: { accountId } },
      include: { externalApplication: true },
    });
    if (!enrollment?.externalApplication) {
      throw new NotFoundException('External application not found');
    }
    if (enrollment.status !== 'SUBMITTED_EXTERNALLY') {
      throw new ConflictException(
        'External application can no longer be user-updated',
      );
    }
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.externalLicenceApplication.update({
        where: { id: enrollment.externalApplication!.id },
        data: {
          authorityReference: dto.authorityReference?.trim(),
          submittedAt: dto.submittedAt
            ? this.parseDate(dto.submittedAt)
            : undefined,
          status: dto.status,
          lastReportedAt: occurredAt,
        },
      });
      if (dto.status === 'REJECTED') {
        await transaction.pathwayEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'REJECTED', completedAt: occurredAt },
        });
      }
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'licensing.external_application.updated',
        resourceType: 'external_licence_application',
        resourceId: updated.id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: {
          verificationSource: 'USER_REPORTED',
          status: {
            from: enrollment.externalApplication!.status,
            to: updated.status,
          },
        },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'ExternalLicenceApplicationUpdated',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: enrollmentId,
          correlationId,
          payload: {
            enrollmentId,
            externalApplicationId: updated.id,
            status: updated.status,
            verificationSource: updated.verificationSource,
          },
        },
      ]);
      return updated;
    });
  }

  async withdrawEnrollment(
    accountId: string,
    enrollmentId: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = 'withdraw-enrollment';
    const enrollment = await this.idempotent(
      accountId,
      operation,
      idempotencyKey,
      { enrollmentId },
      (resourceId) =>
        this.prisma.pathwayEnrollment.findUniqueOrThrow({
          where: { id: resourceId },
        }),
      async (transaction, requestHash) => {
        const current = await transaction.pathwayEnrollment.findFirst({
          where: { id: enrollmentId, professional: { accountId } },
          include: { externalApplication: true },
        });
        if (!current) {
          throw new NotFoundException('Pathway enrollment not found');
        }
        try {
          assertEnrollmentTransition(current.status, 'WITHDRAWN');
        } catch (error) {
          throw new ConflictException(
            error instanceof Error ? error.message : 'Invalid transition',
          );
        }
        const occurredAt = new Date();
        const updated = await transaction.pathwayEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'WITHDRAWN', completedAt: occurredAt },
        });
        if (current.externalApplication) {
          await transaction.externalLicenceApplication.update({
            where: { id: current.externalApplication.id },
            data: { status: 'WITHDRAWN', lastReportedAt: occurredAt },
          });
        }
        await this.audit.recordInTransaction(transaction, {
          actorId: accountId,
          action: 'licensing.pathway_enrollment.withdrawn',
          resourceType: 'pathway_enrollment',
          resourceId: enrollmentId,
          occurredAt: occurredAt.toISOString(),
          correlationId,
          changes: { status: { from: current.status, to: 'WITHDRAWN' } },
        });
        await this.outbox.enqueue(transaction, [
          {
            id: randomUUID(),
            name: 'PathwayEnrollmentWithdrawn',
            version: 1,
            occurredAt: occurredAt.toISOString(),
            aggregateId: enrollmentId,
            correlationId,
            payload: { enrollmentId },
          },
        ]);
        await this.saveReceipt(
          transaction,
          accountId,
          operation,
          idempotencyKey,
          requestHash,
          enrollmentId,
          200,
        );
        return updated;
      },
    );
    return this.getOwnedEnrollment(accountId, enrollment.id);
  }

  async getReminderPreferences(accountId: string) {
    const preference = await this.prisma.licensingReminderPreference.findUnique(
      {
        where: { accountId },
      },
    );
    return (
      preference ?? {
        accountId,
        timeZone: 'UTC',
        renewalEnabled: true,
        leadDays: 90,
      }
    );
  }

  async updateReminderPreferences(
    accountId: string,
    dto: UpdateLicensingReminderPreferencesDto,
    correlationId: string,
  ) {
    this.assertTimeZone(dto.timeZone);
    const previous = await this.prisma.licensingReminderPreference.findUnique({
      where: { accountId },
    });
    const updated = await this.prisma.licensingReminderPreference.upsert({
      where: { accountId },
      create: { accountId, ...dto },
      update: dto,
    });
    await this.audit.record({
      actorId: accountId,
      action: 'licensing.reminder_preferences.updated',
      resourceType: 'licensing_reminder_preference',
      resourceId: updated.id,
      occurredAt: new Date().toISOString(),
      correlationId,
      changes: {
        from: previous
          ? {
              timeZone: previous.timeZone,
              renewalEnabled: previous.renewalEnabled,
              leadDays: previous.leadDays,
            }
          : null,
        to: dto,
      },
    });
    return updated;
  }

  projectVerifiedCredential(
    credentialId: string,
    actorId: string,
    correlationId: string,
  ) {
    return this.prisma.$transaction((transaction) =>
      this.projectVerifiedCredentialInTransaction(
        transaction,
        credentialId,
        actorId,
        correlationId,
      ),
    );
  }

  async projectVerifiedCredentialInTransaction(
    transaction: Prisma.TransactionClient,
    credentialId: string,
    actorId: string,
    correlationId: string,
  ): Promise<string | null> {
    const credential = await transaction.credential.findUnique({
      where: { id: credentialId },
      select: {
        id: true,
        typeCode: true,
        status: true,
        expiryDate: true,
        professional: { select: { accountId: true } },
        requirementProgress: {
          select: {
            enrollment: {
              select: {
                id: true,
                status: true,
                externalApplication: true,
                pathwayVersion: {
                  select: {
                    pathway: {
                      select: { authorityId: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (
      !credential ||
      credential.typeCode !== 'PROFESSIONAL_LICENCE' ||
      credential.status !== 'VERIFIED'
    ) {
      return null;
    }
    const linked = credential.requirementProgress.find(
      ({ enrollment }) =>
        enrollment.status === 'SUBMITTED_EXTERNALLY' &&
        enrollment.externalApplication !== null,
    );
    if (!linked?.enrollment.externalApplication) return null;
    const externalApplication = linked.enrollment.externalApplication;

    const existing = await transaction.professionalLicence.findUnique({
      where: { credentialId },
      include: {
        enrollment: true,
        credential: true,
      },
    });
    if (existing) {
      await this.ensureRenewalDueInTransaction(
        transaction,
        {
          id: existing.id,
          enrollmentId: existing.enrollmentId,
          recipientAccountId: credential.professional.accountId,
          expiryDate: existing.credential.expiryDate,
        },
        new Date(),
      );
      return existing.id;
    }

    const enrollment = linked.enrollment;
    try {
      assertEnrollmentTransition(enrollment.status, 'APPROVED');
    } catch (error) {
      throw new ConflictException(
        error instanceof Error ? error.message : 'Invalid transition',
      );
    }
    const occurredAt = new Date();
    const licence = await transaction.professionalLicence.create({
      data: {
        credentialId,
        enrollmentId: enrollment.id,
        authorityId: enrollment.pathwayVersion.pathway.authorityId,
        licenceNumber: externalApplication.authorityReference,
        status: 'ACTIVE',
      },
    });
    await transaction.externalLicenceApplication.update({
      where: { id: externalApplication.id },
      data: { status: 'APPROVED', lastReportedAt: occurredAt },
    });
    await transaction.pathwayEnrollment.update({
      where: { id: enrollment.id },
      data: { status: 'APPROVED', completedAt: occurredAt },
    });
    await this.audit.recordInTransaction(transaction, {
      actorId,
      action: 'licensing.professional_licence.projected',
      resourceType: 'professional_licence',
      resourceId: licence.id,
      occurredAt: occurredAt.toISOString(),
      correlationId,
      changes: {
        credentialId,
        enrollmentId: enrollment.id,
        status: { to: 'ACTIVE' },
      },
    });
    await this.outbox.enqueue(transaction, [
      {
        id: randomUUID(),
        name: 'ProfessionalLicenceProjected',
        version: 1,
        occurredAt: occurredAt.toISOString(),
        aggregateId: licence.id,
        correlationId,
        payload: {
          licenceId: licence.id,
          credentialId,
          enrollmentId: enrollment.id,
          authorityId: licence.authorityId,
          status: licence.status,
        },
      },
    ]);
    await this.ensureRenewalDueInTransaction(
      transaction,
      {
        id: licence.id,
        enrollmentId: enrollment.id,
        recipientAccountId: credential.professional.accountId,
        expiryDate: credential.expiryDate,
      },
      occurredAt,
    );
    return licence.id;
  }

  async projectRenewalReminders(asOf = new Date()) {
    const licences = await this.prisma.professionalLicence.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        enrollmentId: true,
        credential: {
          select: {
            expiryDate: true,
            professional: { select: { accountId: true } },
          },
        },
      },
    });
    let created = 0;
    for (const licence of licences) {
      const result = await this.prisma.$transaction((transaction) =>
        this.ensureRenewalDueInTransaction(
          transaction,
          {
            id: licence.id,
            enrollmentId: licence.enrollmentId,
            recipientAccountId: licence.credential.professional.accountId,
            expiryDate: licence.credential.expiryDate,
          },
          asOf,
        ),
      );
      if (result) created += 1;
    }
    return { evaluated: licences.length, created };
  }

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
    const owned = await this.prisma.pathwayEnrollment.findFirst({
      where: { id: enrollmentId, professional: { accountId } },
      select: { id: true },
    });
    if (!owned) return null;
    await this.refreshLinkedEvidence(accountId, enrollmentId);
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

  private async requireProgressContext(
    accountId: string,
    enrollmentId: string,
    requirementId: string,
  ): Promise<ProgressContext> {
    const enrollment = await this.prisma.pathwayEnrollment.findFirst({
      where: { id: enrollmentId, professional: { accountId } },
      select: {
        id: true,
        pathwayVersion: {
          select: {
            requirements: {
              where: { id: requirementId },
              select: { id: true, rule: true },
            },
          },
        },
        requirementProgress: {
          where: { requirementId },
          select: {
            id: true,
            state: true,
            linkedCredentialId: true,
            note: true,
          },
        },
      },
    });
    const requirement = enrollment?.pathwayVersion.requirements[0];
    const progress = enrollment?.requirementProgress[0];
    if (!enrollment || !requirement || !progress) {
      throw new NotFoundException('Enrollment requirement not found');
    }
    return { enrollmentId: enrollment.id, requirement, progress };
  }

  private async refreshLinkedEvidence(accountId: string, enrollmentId: string) {
    const enrollment = await this.prisma.pathwayEnrollment.findFirst({
      where: { id: enrollmentId, professional: { accountId } },
      select: {
        id: true,
        requirementProgress: {
          select: {
            id: true,
            state: true,
            linkedCredentialId: true,
            note: true,
            requirement: { select: { id: true, rule: true } },
          },
        },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('Pathway enrollment not found');
    }
    const evidence = await this.credentials.listOwnedEvidence(accountId);
    for (const progress of enrollment.requirementProgress) {
      if (!progress.linkedCredentialId) continue;
      const linked = evidence.find(
        ({ id }) => id === progress.linkedCredentialId,
      );
      const evaluation = evaluateRequirement(
        this.requirementRule(progress.requirement.rule),
        linked ? [linked] : [],
      );
      if (
        progress.state !== evaluation.state ||
        progress.linkedCredentialId !== (evaluation.credentialId ?? null)
      ) {
        await this.changeRequirementProgress(
          accountId,
          {
            enrollmentId,
            requirement: progress.requirement,
            progress,
          },
          evaluation.state,
          evaluation.credentialId,
          evaluation.explanation,
          randomUUID(),
        );
      }
    }
  }

  private async changeRequirementProgress(
    accountId: string,
    context: ProgressContext,
    state: RequirementProgressState,
    credentialId: string | undefined,
    note: string,
    correlationId: string,
  ) {
    const linkedCredentialId = credentialId ?? null;
    const effectiveChange =
      context.progress.state !== state ||
      context.progress.linkedCredentialId !== linkedCredentialId;
    if (!effectiveChange) {
      if (context.progress.note === note) {
        return this.prisma.requirementProgress.findUniqueOrThrow({
          where: { id: context.progress.id },
          include: { requirement: true },
        });
      }
      return this.prisma.requirementProgress.update({
        where: { id: context.progress.id },
        data: { note, evaluatedAt: new Date() },
        include: { requirement: true },
      });
    }

    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.requirementProgress.update({
        where: { id: context.progress.id },
        data: {
          state,
          linkedCredentialId,
          note,
          evaluatedAt: occurredAt,
        },
        include: { requirement: true },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'licensing.requirement_progress.changed',
        resourceType: 'requirement_progress',
        resourceId: context.progress.id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: {
          enrollmentId: context.enrollmentId,
          requirementId: context.requirement.id,
          state: { from: context.progress.state, to: state },
          credentialId: {
            from: context.progress.linkedCredentialId,
            to: linkedCredentialId,
          },
        },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'RequirementProgressChanged',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: context.enrollmentId,
          correlationId,
          payload: {
            enrollmentId: context.enrollmentId,
            requirementId: context.requirement.id,
            state,
            credentialId: linkedCredentialId,
          },
        },
      ]);
      return updated;
    });
  }

  private async ensureRenewalDueInTransaction(
    transaction: Prisma.TransactionClient,
    licence: {
      id: string;
      enrollmentId: string;
      recipientAccountId: string;
      expiryDate: Date | null;
    },
    asOf: Date,
  ) {
    if (!licence.expiryDate) return false;
    const preference = await transaction.licensingReminderPreference.findUnique(
      {
        where: { accountId: licence.recipientAccountId },
      },
    );
    const renewalEnabled = preference?.renewalEnabled ?? true;
    if (!renewalEnabled) return false;
    const timeZone = preference?.timeZone ?? 'UTC';
    const leadDays = preference?.leadDays ?? 90;
    const expiryDate = licence.expiryDate.toISOString().slice(0, 10);
    const expiryDay = this.dateStringEpoch(expiryDate);
    const currentDay = this.localCalendarDayEpoch(asOf, timeZone);
    const daysUntilExpiry = Math.round(
      (expiryDay - currentDay) / (24 * 60 * 60 * 1000),
    );
    if (daysUntilExpiry < 0 || daysUntilExpiry > leadDays) return false;

    const pathwayRoute = `/licensing/enrollments/${licence.enrollmentId}`;
    const notification = await this.notifications.ensureLicenceRenewalDue(
      transaction,
      {
        recipientAccountId: licence.recipientAccountId,
        licenceId: licence.id,
        expiryDate,
        pathwayRoute,
      },
    );
    const existingEvent = await transaction.outboxEvent.findFirst({
      where: { name: 'LicenceRenewalDue', aggregateId: licence.id },
      select: { id: true },
    });
    if (!existingEvent) {
      const occurredAt = new Date();
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'LicenceRenewalDue',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: licence.id,
          correlationId: randomUUID(),
          payload: {
            licenceId: licence.id,
            expiryDate,
            pathwayRoute,
          },
        },
      ]);
    }
    return notification.created || !existingEvent;
  }

  private localCalendarDayEpoch(date: Date, timeZone: string) {
    let formatter: Intl.DateTimeFormat;
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }
    const parts = Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, value]),
    );
    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
    );
  }

  private dateStringEpoch(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  }

  private findPublicPathway(pathwayId: string) {
    const effective = this.effectiveVersionWhere();
    return this.prisma.licencePathway.findFirst({
      where: {
        id: pathwayId,
        active: true,
        jurisdiction: { active: true },
        authority: { active: true },
        licenceType: { active: true },
        versions: { some: effective },
      },
      include: {
        jurisdiction: true,
        authority: true,
        licenceType: true,
        versions: {
          where: effective,
          orderBy: { version: 'desc' },
          take: 1,
          include: { requirements: { orderBy: { position: 'asc' } } },
        },
      },
    });
  }

  private effectiveVersionWhere() {
    const now = new Date();
    return {
      status: 'PUBLISHED' as const,
      AND: [
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
      ],
    };
  }

  private enrollmentInclude() {
    return {
      pathwayVersion: {
        include: {
          pathway: {
            include: {
              jurisdiction: true,
              authority: true,
              licenceType: true,
            },
          },
          requirements: { orderBy: { position: 'asc' as const } },
        },
      },
      requirementProgress: {
        orderBy: { requirement: { position: 'asc' as const } },
        include: { requirement: true },
      },
      externalApplication: true,
      professionalLicence: {
        include: { credential: true, authority: true },
      },
    } as const;
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

  private isVersionEffective(
    effectiveFrom: Date | null,
    effectiveTo: Date | null,
  ) {
    const now = Date.now();
    return (
      (!effectiveFrom || effectiveFrom.getTime() <= now) &&
      (!effectiveTo || effectiveTo.getTime() >= now)
    );
  }

  private requirementRule(value: Prisma.JsonValue): RequirementRule {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new ConflictException('Pathway requirement rule is invalid');
    }
    const kind = value.kind;
    const credentialTypeCode = value.credentialTypeCode;
    const countryCode = value.countryCode;
    if (
      kind !== 'VERIFIED_CREDENTIAL' ||
      typeof credentialTypeCode !== 'string' ||
      (countryCode !== undefined && typeof countryCode !== 'string')
    ) {
      throw new ConflictException('Pathway requirement rule is invalid');
    }
    return {
      kind,
      credentialTypeCode,
      ...(countryCode ? { countryCode } : {}),
    };
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

  private parseDate(value: string) {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  }

  private assertTimeZone(timeZone: string) {
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format(new Date());
    } catch {
      throw new BadRequestException('A valid IANA time zone is required');
    }
  }
}
