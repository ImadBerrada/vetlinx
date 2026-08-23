import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { JobApplicationStatus } from '../../generated/prisma/enums';
import {
  OUTBOX_WRITER,
  type OutboxWriter,
} from '../../platform/events/outbox-writer.port';
import { PrismaService } from '../../platform/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ORGANIZATIONS_PUBLIC_API,
  type OrganizationsPublicApi,
} from '../organizations/organizations.public';
import {
  PROFESSIONALS_PUBLIC_API,
  type ProfessionalsPublicApi,
} from '../professionals/professionals.public';
import type {
  ApplyToJobDto,
  CandidateSearchQueryDto,
  CreateOfferDto,
  CreateJobDto,
  EndEmploymentDto,
  JobSearchQueryDto,
  RespondToOfferDto,
  ScheduleInterviewDto,
  UpdateApplicationStatusDto,
  UpdateInterviewStatusDto,
  UpdateJobDto,
  UpdateOfferDto,
} from './dto/recruitment.dto';

const jobSelect = {
  id: true,
  organizationId: true,
  createdByAccountId: true,
  title: true,
  description: true,
  countryCode: true,
  city: true,
  employmentType: true,
  workMode: true,
  minExperienceYears: true,
  salaryMinMonthly: true,
  salaryMaxMonthly: true,
  currencyCode: true,
  status: true,
  publishedAt: true,
  closingAt: true,
  createdAt: true,
  updatedAt: true,
  requirements: {
    select: {
      id: true,
      category: true,
      valueCode: true,
      label: true,
      required: true,
    },
  },
} as const;

@Injectable()
export class RecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(ORGANIZATIONS_PUBLIC_API)
    private readonly organizations: OrganizationsPublicApi,
    @Inject(PROFESSIONALS_PUBLIC_API)
    private readonly professionals: ProfessionalsPublicApi,
  ) {}

  async listOrganizationJobs(accountId: string, organizationId: string) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    return this.prisma.job.findMany({
      where: { organizationId },
      select: { ...jobSelect, _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createJob(
    accountId: string,
    organizationId: string,
    dto: CreateJobDto,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    this.validateCompensation(dto);
    const id = randomUUID();
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const job = await transaction.job.create({
        data: {
          id,
          organizationId,
          createdByAccountId: accountId,
          title: dto.title.trim(),
          description: dto.description.trim(),
          countryCode: dto.countryCode.toUpperCase(),
          city: dto.city.trim(),
          employmentType: dto.employmentType,
          workMode: dto.workMode,
          minExperienceYears: dto.minExperienceYears,
          salaryMinMonthly: dto.salaryMinMonthly,
          salaryMaxMonthly: dto.salaryMaxMonthly,
          currencyCode: dto.currencyCode?.toUpperCase(),
          closingAt: dto.closingAt ? new Date(dto.closingAt) : null,
          requirements: {
            create: dto.requirements.map((item) => ({
              category: item.category,
              valueCode: item.valueCode.trim().toUpperCase(),
              label: item.label.trim(),
              required: item.required,
            })),
          },
        },
        select: jobSelect,
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'recruitment.job.created',
        resourceType: 'job',
        resourceId: id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { organizationId, status: { to: 'DRAFT' } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'JobCreated',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: id,
          correlationId,
          payload: { jobId: id, organizationId },
        },
      ]);
      return job;
    });
  }

  async publishJob(
    accountId: string,
    organizationId: string,
    jobId: string,
    correlationId: string,
  ) {
    const access = await this.requireRecruitmentAccess(
      accountId,
      organizationId,
    );
    if (access.status !== 'VERIFIED')
      throw new ConflictException(
        'Organization verification is required before publishing jobs',
      );
    const job = await this.requireOrganizationJob(organizationId, jobId);
    if (job.status === 'PUBLISHED') return job;
    if (job.status !== 'DRAFT' && job.status !== 'PAUSED')
      throw new ConflictException(
        'Job cannot be published from its current state',
      );
    if (job.closingAt && job.closingAt <= new Date())
      throw new ConflictException('Closing date must be in the future');
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const published = await transaction.job.update({
        where: { id: jobId },
        data: { status: 'PUBLISHED', publishedAt: occurredAt },
        select: jobSelect,
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'recruitment.job.published',
        resourceType: 'job',
        resourceId: jobId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { status: { from: job.status, to: 'PUBLISHED' } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'JobPublished',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: jobId,
          correlationId,
          payload: { jobId, organizationId },
        },
      ]);
      return published;
    });
  }

  async updateJob(
    accountId: string,
    organizationId: string,
    jobId: string,
    dto: UpdateJobDto,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const job = await this.requireOrganizationJob(organizationId, jobId);
    if (job.status !== 'DRAFT')
      throw new ConflictException('Only draft jobs can be edited');
    this.validateCompensation({
      salaryMinMonthly:
        dto.salaryMinMonthly ?? job.salaryMinMonthly ?? undefined,
      salaryMaxMonthly:
        dto.salaryMaxMonthly ?? job.salaryMaxMonthly ?? undefined,
      currencyCode: dto.currencyCode ?? job.currencyCode ?? undefined,
    });
    if (dto.closingAt && new Date(dto.closingAt) <= new Date())
      throw new ConflictException('Closing date must be in the future');
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      if (dto.requirements)
        await transaction.jobRequirement.deleteMany({ where: { jobId } });
      const updated = await transaction.job.update({
        where: { id: jobId },
        data: {
          ...(dto.title ? { title: dto.title.trim() } : {}),
          ...(dto.description ? { description: dto.description.trim() } : {}),
          ...(dto.countryCode
            ? { countryCode: dto.countryCode.toUpperCase() }
            : {}),
          ...(dto.city ? { city: dto.city.trim() } : {}),
          ...(dto.employmentType ? { employmentType: dto.employmentType } : {}),
          ...(dto.workMode ? { workMode: dto.workMode } : {}),
          ...(dto.minExperienceYears !== undefined
            ? { minExperienceYears: dto.minExperienceYears }
            : {}),
          ...(dto.salaryMinMonthly !== undefined
            ? { salaryMinMonthly: dto.salaryMinMonthly }
            : {}),
          ...(dto.salaryMaxMonthly !== undefined
            ? { salaryMaxMonthly: dto.salaryMaxMonthly }
            : {}),
          ...(dto.currencyCode
            ? { currencyCode: dto.currencyCode.toUpperCase() }
            : {}),
          ...(dto.closingAt ? { closingAt: new Date(dto.closingAt) } : {}),
          ...(dto.requirements
            ? {
                requirements: {
                  create: dto.requirements.map((item) => ({
                    category: item.category,
                    valueCode: item.valueCode.trim().toUpperCase(),
                    label: item.label.trim(),
                    required: item.required,
                  })),
                },
              }
            : {}),
        },
        select: jobSelect,
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'recruitment.job.updated',
        resourceType: 'job',
        resourceId: jobId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'JobUpdated',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: jobId,
          correlationId,
          payload: { jobId, organizationId },
        },
      ]);
      return updated;
    });
  }

  async closeJob(
    accountId: string,
    organizationId: string,
    jobId: string,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const job = await this.requireOrganizationJob(organizationId, jobId);
    if (job.status === 'CLOSED') return job;
    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'CLOSED' },
      select: jobSelect,
    });
    await this.audit.record({
      actorId: accountId,
      action: 'recruitment.job.closed',
      resourceType: 'job',
      resourceId: jobId,
      occurredAt: new Date().toISOString(),
      correlationId,
      changes: { status: { from: job.status, to: 'CLOSED' } },
    });
    return updated;
  }

  async searchPublished(query: JobSearchQueryDto) {
    const now = new Date();
    return this.prisma.job.findMany({
      where: {
        status: 'PUBLISHED',
        AND: [
          { OR: [{ closingAt: null }, { closingAt: { gt: now } }] },
          ...(query.q
            ? [
                {
                  OR: [
                    {
                      title: {
                        contains: query.q,
                        mode: 'insensitive' as const,
                      },
                    },
                    {
                      description: {
                        contains: query.q,
                        mode: 'insensitive' as const,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
        ...(query.countryCode
          ? { countryCode: query.countryCode.toUpperCase() }
          : {}),
        ...(query.city
          ? { city: { contains: query.city, mode: 'insensitive' as const } }
          : {}),
        ...(query.employmentType
          ? { employmentType: query.employmentType as never }
          : {}),
      },
      select: {
        ...jobSelect,
        organization: {
          select: { id: true, legalName: true, publicName: true, status: true },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });
  }

  async getPublished(jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, status: 'PUBLISHED' },
      select: {
        ...jobSelect,
        organization: {
          select: { id: true, legalName: true, publicName: true, status: true },
        },
      },
    });
    if (!job) throw new NotFoundException('Published job not found');
    return job;
  }

  async apply(
    accountId: string,
    jobId: string,
    dto: ApplyToJobDto,
    correlationId: string,
  ) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional)
      throw new NotFoundException('Professional profile not found');
    const job = await this.getPublished(jobId);
    if (await this.organizations.findAccess(accountId, job.organizationId))
      throw new ConflictException(
        'Organization members cannot apply to their own job',
      );
    if (job.closingAt && job.closingAt <= new Date())
      throw new ConflictException('Applications are closed');
    const id = randomUUID();
    const occurredAt = new Date();
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const application = await transaction.jobApplication.create({
          data: {
            id,
            jobId,
            professionalProfileId: professional.id,
            coverNote: dto.coverNote?.trim() || null,
            history: {
              create: { toStatus: 'SUBMITTED', actorAccountId: accountId },
            },
          },
          select: {
            id: true,
            jobId: true,
            professionalProfileId: true,
            coverNote: true,
            status: true,
            submittedAt: true,
            updatedAt: true,
          },
        });
        const recipients = await transaction.organizationMembership.findMany({
          where: {
            organizationId: job.organizationId,
            role: { in: ['OWNER', 'ADMIN', 'RECRUITER'] },
          },
          select: { accountId: true },
        });
        await transaction.notification.createMany({
          data: recipients.map(({ accountId: recipientAccountId }) => ({
            recipientAccountId,
            kind: 'JOB_APPLICATION_RECEIVED',
            title: 'New job application',
            message: `A professional applied for ${job.title}.`,
            resourceType: 'job_application',
            resourceId: id,
          })),
        });
        await this.audit.recordInTransaction(transaction, {
          actorId: accountId,
          action: 'recruitment.application.submitted',
          resourceType: 'job_application',
          resourceId: id,
          occurredAt: occurredAt.toISOString(),
          correlationId,
          changes: { jobId, status: { to: 'SUBMITTED' } },
        });
        await this.outbox.enqueue(transaction, [
          {
            id: randomUUID(),
            name: 'ApplicationSubmitted',
            version: 1,
            occurredAt: occurredAt.toISOString(),
            aggregateId: id,
            correlationId,
            payload: {
              applicationId: id,
              jobId,
              professionalProfileId: professional.id,
            },
          },
        ]);
        return application;
      });
    } catch (error) {
      if (this.isPrismaUniqueConstraintError(error))
        throw new ConflictException('You already applied to this job');
      throw error;
    }
  }

  async withdrawApplication(
    accountId: string,
    applicationId: string,
    correlationId: string,
  ) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional)
      throw new NotFoundException('Professional profile not found');
    const application = await this.prisma.jobApplication.findFirst({
      where: { id: applicationId, professionalProfileId: professional.id },
      select: { id: true, jobId: true, status: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (
      !['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED'].includes(application.status)
    )
      throw new ConflictException(
        'Application cannot be withdrawn from its current state',
      );
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.jobApplication.update({
        where: { id: applicationId },
        data: {
          status: 'WITHDRAWN',
          history: {
            create: {
              fromStatus: application.status,
              toStatus: 'WITHDRAWN',
              actorAccountId: accountId,
            },
          },
        },
        select: { id: true, jobId: true, status: true, updatedAt: true },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'recruitment.application.withdrawn',
        resourceType: 'job_application',
        resourceId: applicationId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { status: { from: application.status, to: 'WITHDRAWN' } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'ApplicationWithdrawn',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: applicationId,
          correlationId,
          payload: { applicationId, jobId: application.jobId },
        },
      ]);
      return updated;
    });
  }

  async listMyApplications(accountId: string) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional)
      throw new NotFoundException('Professional profile not found');
    return this.prisma.jobApplication.findMany({
      where: { professionalProfileId: professional.id },
      select: {
        id: true,
        status: true,
        coverNote: true,
        submittedAt: true,
        updatedAt: true,
        history: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            reason: true,
            createdAt: true,
          },
        },
        interviews: {
          select: this.interviewSelect(),
          orderBy: { startsAt: 'desc' },
        },
        offers: {
          where: { status: { not: 'DRAFT' } },
          select: {
            ...this.offerSelect(),
            employment: { select: this.employmentSelect() },
          },
          orderBy: { createdAt: 'desc' },
        },
        job: {
          select: {
            ...jobSelect,
            organization: { select: { legalName: true, publicName: true } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async listApplications(
    accountId: string,
    organizationId: string,
    jobId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    await this.requireOrganizationJob(organizationId, jobId);
    return this.prisma.jobApplication.findMany({
      where: { jobId },
      select: {
        id: true,
        coverNote: true,
        status: true,
        submittedAt: true,
        updatedAt: true,
        history: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            reason: true,
            createdAt: true,
          },
        },
        interviews: {
          select: this.interviewSelect(),
          orderBy: { startsAt: 'desc' },
        },
        offers: {
          select: {
            ...this.offerSelect(),
            employment: { select: this.employmentSelect() },
          },
          orderBy: { createdAt: 'desc' },
        },
        professional: {
          select: {
            id: true,
            displayName: true,
            countryCode: true,
            status: true,
            account: { select: { email: true } },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  async updateApplicationStatus(
    accountId: string,
    organizationId: string,
    applicationId: string,
    dto: UpdateApplicationStatusDto,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const application = await this.prisma.jobApplication.findFirst({
      where: { id: applicationId, job: { organizationId } },
      select: {
        id: true,
        status: true,
        professionalProfileId: true,
        jobId: true,
        job: { select: { title: true } },
        professional: { select: { accountId: true } },
      },
    });
    if (!application) throw new NotFoundException('Application not found');
    const transitions: Partial<
      Record<JobApplicationStatus, JobApplicationStatus[]>
    > = {
      SUBMITTED: ['UNDER_REVIEW', 'SHORTLISTED', 'REJECTED'],
      UNDER_REVIEW: ['SHORTLISTED', 'REJECTED'],
      SHORTLISTED: ['UNDER_REVIEW', 'REJECTED'],
    };
    if (!transitions[application.status]?.includes(dto.status))
      throw new ConflictException(
        'Application status transition is not allowed',
      );
    if (
      dto.status === 'REJECTED' &&
      (!dto.reason || dto.reason.trim().length < 10)
    )
      throw new ConflictException('A rejection reason is required');
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.jobApplication.update({
        where: { id: applicationId },
        data: {
          status: dto.status,
          history: {
            create: {
              fromStatus: application.status,
              toStatus: dto.status,
              actorAccountId: accountId,
              reason: dto.reason?.trim(),
            },
          },
        },
        select: {
          id: true,
          jobId: true,
          professionalProfileId: true,
          coverNote: true,
          status: true,
          submittedAt: true,
          updatedAt: true,
        },
      });
      await transaction.notification.create({
        data: {
          recipientAccountId: application.professional.accountId,
          kind: 'JOB_APPLICATION_STATUS_UPDATED',
          title: 'Application updated',
          message:
            dto.status === 'REJECTED'
              ? dto.reason!.trim()
              : `Your application for ${application.job.title} is now ${dto.status.toLowerCase().replaceAll('_', ' ')}.`,
          resourceType: 'job_application',
          resourceId: applicationId,
        },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'recruitment.application.status.updated',
        resourceType: 'job_application',
        resourceId: applicationId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        reason: dto.reason?.trim(),
        changes: { status: { from: application.status, to: dto.status } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'ApplicationStatusChanged',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: applicationId,
          correlationId,
          payload: {
            applicationId,
            jobId: application.jobId,
            fromStatus: application.status,
            toStatus: dto.status,
          },
        },
      ]);
      return updated;
    });
  }

  async scheduleInterview(
    accountId: string,
    organizationId: string,
    applicationId: string,
    dto: ScheduleInterviewDto,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const application = await this.requireOrganizationApplication(
      organizationId,
      applicationId,
    );
    if (
      !['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEWING'].includes(
        application.status,
      )
    )
      throw new ConflictException(
        'An interview cannot be scheduled from the current application state',
      );
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (startsAt <= new Date())
      throw new ConflictException('Interview start must be in the future');
    if (endsAt <= startsAt)
      throw new ConflictException('Interview end must be after its start');
    if (dto.mode === 'VIDEO' && !dto.joinUrl)
      throw new ConflictException('A video interview requires a join URL');
    if (dto.mode === 'IN_PERSON' && !dto.location)
      throw new ConflictException('An in-person interview requires a location');
    const id = randomUUID();
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const interview = await transaction.interview.create({
        data: {
          id,
          applicationId,
          scheduledByAccountId: accountId,
          startsAt,
          endsAt,
          timeZone: dto.timeZone.trim(),
          mode: dto.mode,
          location: dto.location?.trim(),
          joinUrl: dto.joinUrl?.trim(),
          notes: dto.notes?.trim(),
        },
        select: this.interviewSelect(),
      });
      if (application.status !== 'INTERVIEWING')
        await transaction.jobApplication.update({
          where: { id: applicationId },
          data: {
            status: 'INTERVIEWING',
            history: {
              create: {
                fromStatus: application.status,
                toStatus: 'INTERVIEWING',
                actorAccountId: accountId,
              },
            },
          },
        });
      await transaction.notification.create({
        data: {
          recipientAccountId: application.professional.accountId,
          kind: 'INTERVIEW_SCHEDULED',
          title: 'Interview scheduled',
          message: `${application.job.title}: ${startsAt.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC.`,
          resourceType: 'interview',
          resourceId: id,
        },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'recruitment.interview.scheduled',
        resourceType: 'interview',
        resourceId: id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: {
          applicationId,
          startsAt: dto.startsAt,
          status: { to: 'SCHEDULED' },
        },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'InterviewScheduled',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: id,
          correlationId,
          payload: { interviewId: id, applicationId, jobId: application.jobId },
        },
      ]);
      return interview;
    });
  }

  async updateInterviewStatus(
    accountId: string,
    organizationId: string,
    interviewId: string,
    dto: UpdateInterviewStatusDto,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, application: { job: { organizationId } } },
      select: {
        ...this.interviewSelect(),
        application: {
          select: {
            professional: { select: { accountId: true } },
            job: { select: { title: true } },
          },
        },
      },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    if (interview.status !== 'SCHEDULED')
      throw new ConflictException(
        'Only scheduled interviews can be completed or cancelled',
      );
    if (
      dto.status === 'CANCELLED' &&
      (!dto.reason || dto.reason.trim().length < 10)
    )
      throw new ConflictException('A cancellation reason is required');
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.interview.update({
        where: { id: interviewId },
        data: {
          status: dto.status,
          cancellationReason:
            dto.status === 'CANCELLED' ? dto.reason?.trim() : null,
        },
        select: this.interviewSelect(),
      });
      await transaction.notification.create({
        data: {
          recipientAccountId: interview.application.professional.accountId,
          kind: 'INTERVIEW_UPDATED',
          title: `Interview ${dto.status === 'COMPLETED' ? 'completed' : 'cancelled'}`,
          message:
            dto.status === 'CANCELLED'
              ? dto.reason!.trim()
              : `Your interview for ${interview.application.job.title} was marked complete.`,
          resourceType: 'interview',
          resourceId: interviewId,
        },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: `recruitment.interview.${dto.status.toLowerCase()}`,
        resourceType: 'interview',
        resourceId: interviewId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        reason: dto.reason?.trim(),
        changes: { status: { from: 'SCHEDULED', to: dto.status } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name:
            dto.status === 'COMPLETED'
              ? 'InterviewCompleted'
              : 'InterviewCancelled',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: interviewId,
          correlationId,
          payload: { interviewId, applicationId: interview.applicationId },
        },
      ]);
      return updated;
    });
  }

  async listMyInterviews(accountId: string) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional)
      throw new NotFoundException('Professional profile not found');
    return this.prisma.interview.findMany({
      where: { application: { professionalProfileId: professional.id } },
      select: {
        ...this.interviewSelect(),
        application: {
          select: {
            id: true,
            job: {
              select: {
                id: true,
                title: true,
                organization: { select: { legalName: true, publicName: true } },
              },
            },
          },
        },
      },
      orderBy: { startsAt: 'desc' },
    });
  }

  async createOffer(
    accountId: string,
    organizationId: string,
    applicationId: string,
    dto: CreateOfferDto,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const application = await this.requireOrganizationApplication(
      organizationId,
      applicationId,
    );
    if (
      !['SHORTLISTED', 'INTERVIEWING', 'OFFERED'].includes(application.status)
    )
      throw new ConflictException(
        'An offer cannot be created from the current application state',
      );
    await this.assertNoActiveOffer(applicationId);
    this.validateOfferDates(dto.proposedStartDate, dto.expiresAt);
    const id = randomUUID();
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const offer = await transaction.jobOffer.create({
        data: {
          id,
          applicationId,
          createdByAccountId: accountId,
          salaryMonthly: dto.salaryMonthly,
          currencyCode: dto.currencyCode.toUpperCase(),
          proposedStartDate: new Date(dto.proposedStartDate),
          expiresAt: new Date(dto.expiresAt),
          terms: dto.terms.trim(),
        },
        select: this.offerSelect(),
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'recruitment.offer.created',
        resourceType: 'job_offer',
        resourceId: id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { applicationId, status: { to: 'DRAFT' } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'OfferCreated',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: id,
          correlationId,
          payload: { offerId: id, applicationId, jobId: application.jobId },
        },
      ]);
      return offer;
    });
  }

  async updateOffer(
    accountId: string,
    organizationId: string,
    offerId: string,
    dto: UpdateOfferDto,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const offer = await this.requireOrganizationOffer(organizationId, offerId);
    if (offer.status !== 'DRAFT')
      throw new ConflictException('Only draft offers can be edited');
    this.validateOfferDates(
      dto.proposedStartDate ?? offer.proposedStartDate.toISOString(),
      dto.expiresAt ?? offer.expiresAt.toISOString(),
    );
    const updated = await this.prisma.jobOffer.update({
      where: { id: offerId },
      data: {
        ...(dto.salaryMonthly !== undefined
          ? { salaryMonthly: dto.salaryMonthly }
          : {}),
        ...(dto.currencyCode
          ? { currencyCode: dto.currencyCode.toUpperCase() }
          : {}),
        ...(dto.proposedStartDate
          ? { proposedStartDate: new Date(dto.proposedStartDate) }
          : {}),
        ...(dto.expiresAt ? { expiresAt: new Date(dto.expiresAt) } : {}),
        ...(dto.terms ? { terms: dto.terms.trim() } : {}),
      },
      select: this.offerSelect(),
    });
    await this.audit.record({
      actorId: accountId,
      action: 'recruitment.offer.updated',
      resourceType: 'job_offer',
      resourceId: offerId,
      occurredAt: new Date().toISOString(),
      correlationId,
    });
    return updated;
  }

  async sendOffer(
    accountId: string,
    organizationId: string,
    offerId: string,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const offer = await this.requireOrganizationOffer(organizationId, offerId);
    if (offer.status !== 'DRAFT')
      throw new ConflictException('Only draft offers can be sent');
    if (offer.expiresAt <= new Date())
      throw new ConflictException('Offer expiry must be in the future');
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const sent = await transaction.jobOffer.update({
        where: { id: offerId },
        data: { status: 'SENT', sentAt: occurredAt },
        select: this.offerSelect(),
      });
      if (offer.application.status !== 'OFFERED')
        await transaction.jobApplication.update({
          where: { id: offer.applicationId },
          data: {
            status: 'OFFERED',
            history: {
              create: {
                fromStatus: offer.application.status,
                toStatus: 'OFFERED',
                actorAccountId: accountId,
              },
            },
          },
        });
      await transaction.notification.create({
        data: {
          recipientAccountId: offer.application.professional.accountId,
          kind: 'OFFER_RECEIVED',
          title: 'Employment offer received',
          message: `${offer.application.job.title}: review and respond before ${offer.expiresAt.toLocaleDateString('en-GB')}.`,
          resourceType: 'job_offer',
          resourceId: offerId,
        },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'recruitment.offer.sent',
        resourceType: 'job_offer',
        resourceId: offerId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { status: { from: 'DRAFT', to: 'SENT' } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'OfferSent',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: offerId,
          correlationId,
          payload: { offerId, applicationId: offer.applicationId },
        },
      ]);
      return sent;
    });
  }

  async withdrawOffer(
    accountId: string,
    organizationId: string,
    offerId: string,
    reason: string | undefined,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const offer = await this.requireOrganizationOffer(organizationId, offerId);
    if (!['DRAFT', 'SENT'].includes(offer.status))
      throw new ConflictException(
        'Offer cannot be withdrawn from its current state',
      );
    if (offer.status === 'SENT' && (!reason || reason.trim().length < 10))
      throw new ConflictException('A reason is required for a sent offer');
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.jobOffer.update({
        where: { id: offerId },
        data: {
          status: 'WITHDRAWN',
          responseReason: reason?.trim(),
          respondedAt: occurredAt,
        },
        select: this.offerSelect(),
      });
      if (offer.status === 'SENT')
        await transaction.notification.create({
          data: {
            recipientAccountId: offer.application.professional.accountId,
            kind: 'OFFER_UPDATED',
            title: 'Offer withdrawn',
            message: reason!.trim(),
            resourceType: 'job_offer',
            resourceId: offerId,
          },
        });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'recruitment.offer.withdrawn',
        resourceType: 'job_offer',
        resourceId: offerId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        reason: reason?.trim(),
        changes: { status: { from: offer.status, to: 'WITHDRAWN' } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'OfferWithdrawn',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: offerId,
          correlationId,
          payload: { offerId, applicationId: offer.applicationId },
        },
      ]);
      return updated;
    });
  }

  async listMyOffers(accountId: string) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional)
      throw new NotFoundException('Professional profile not found');
    await this.prisma.jobOffer.updateMany({
      where: {
        status: 'SENT',
        expiresAt: { lte: new Date() },
        application: { professionalProfileId: professional.id },
      },
      data: { status: 'EXPIRED' },
    });
    return this.prisma.jobOffer.findMany({
      where: {
        application: { professionalProfileId: professional.id },
        status: { not: 'DRAFT' },
      },
      select: {
        ...this.offerSelect(),
        application: {
          select: {
            id: true,
            job: {
              select: {
                id: true,
                title: true,
                organization: { select: { legalName: true, publicName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async respondToOffer(
    accountId: string,
    offerId: string,
    dto: RespondToOfferDto,
    correlationId: string,
  ) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional)
      throw new NotFoundException('Professional profile not found');
    const offer = await this.prisma.jobOffer.findFirst({
      where: {
        id: offerId,
        application: { professionalProfileId: professional.id },
      },
      select: {
        ...this.offerSelect(),
        application: {
          select: {
            id: true,
            jobId: true,
            job: { select: { title: true, organizationId: true } },
          },
        },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status !== 'SENT')
      throw new ConflictException('Offer is not awaiting a response');
    if (offer.expiresAt <= new Date()) {
      await this.prisma.jobOffer.update({
        where: { id: offerId },
        data: { status: 'EXPIRED' },
      });
      throw new ConflictException('Offer has expired');
    }
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.jobOffer.update({
        where: { id: offerId },
        data: {
          status: dto.status,
          respondedAt: occurredAt,
          responseReason: dto.reason?.trim(),
        },
        select: this.offerSelect(),
      });
      const recipients = await transaction.organizationMembership.findMany({
        where: {
          organizationId: offer.application.job.organizationId,
          role: { in: ['OWNER', 'ADMIN', 'RECRUITER'] },
        },
        select: { accountId: true },
      });
      await transaction.notification.createMany({
        data: recipients.map(({ accountId: recipientAccountId }) => ({
          recipientAccountId,
          kind: 'OFFER_UPDATED' as const,
          title: `Offer ${dto.status.toLowerCase()}`,
          message: `The offer for ${offer.application.job.title} was ${dto.status.toLowerCase()}.`,
          resourceType: 'job_offer',
          resourceId: offerId,
        })),
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: `recruitment.offer.${dto.status.toLowerCase()}`,
        resourceType: 'job_offer',
        resourceId: offerId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        reason: dto.reason?.trim(),
        changes: { status: { from: 'SENT', to: dto.status } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: dto.status === 'ACCEPTED' ? 'OfferAccepted' : 'OfferDeclined',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: offerId,
          correlationId,
          payload: {
            offerId,
            applicationId: offer.application.id,
            jobId: offer.application.jobId,
          },
        },
      ]);
      return updated;
    });
  }

  async confirmEmployment(
    accountId: string,
    organizationId: string,
    offerId: string,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const offer = await this.requireOrganizationOffer(organizationId, offerId);
    if (offer.status !== 'ACCEPTED')
      throw new ConflictException(
        'Only an accepted offer can become confirmed employment',
      );
    const existing = await this.prisma.employment.findUnique({
      where: { offerId },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException(
        'Employment has already been confirmed for this offer',
      );
    const occurredAt = new Date();
    const startDate = offer.proposedStartDate;
    const initialStatus =
      startDate <= occurredAt ? ('ACTIVE' as const) : ('CONFIRMED' as const);
    const id = randomUUID();
    return this.prisma.$transaction(async (transaction) => {
      const job = await transaction.job.findUniqueOrThrow({
        where: { id: offer.application.jobId },
        select: { title: true, employmentType: true },
      });
      const employment = await transaction.employment.create({
        data: {
          id,
          offerId,
          jobId: offer.application.jobId,
          organizationId,
          professionalProfileId: offer.application.professionalProfileId,
          confirmedByAccountId: accountId,
          title: job.title,
          employmentType: job.employmentType,
          startDate,
          status: initialStatus,
          history: {
            create: {
              toStatus: initialStatus,
              actorAccountId: accountId,
              reason: 'Created from an accepted VetLinX offer.',
            },
          },
        },
        select: this.employmentSelect(),
      });
      await transaction.jobApplication.update({
        where: { id: offer.applicationId },
        data: {
          status: 'HIRED',
          history: {
            create: {
              fromStatus: offer.application.status,
              toStatus: 'HIRED',
              actorAccountId: accountId,
            },
          },
        },
      });
      await transaction.professionalProfile.update({
        where: { id: offer.application.professionalProfileId },
        data: { status: 'ACTIVE' },
      });
      await transaction.notification.create({
        data: {
          recipientAccountId: offer.application.professional.accountId,
          kind: 'EMPLOYMENT_CONFIRMED',
          title: 'Employment confirmed',
          message: `${job.title} is now part of your verified professional record.`,
          resourceType: 'employment',
          resourceId: id,
        },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'recruitment.employment.confirmed',
        resourceType: 'employment',
        resourceId: id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: {
          offerId,
          professionalProfileId: offer.application.professionalProfileId,
          status: { to: initialStatus },
          verificationSource: { to: 'ORGANIZATION_CONFIRMED' },
        },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'EmploymentConfirmed',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: id,
          correlationId,
          payload: {
            employmentId: id,
            offerId,
            applicationId: offer.applicationId,
            professionalProfileId: offer.application.professionalProfileId,
            organizationId,
          },
        },
        {
          id: randomUUID(),
          name: 'ProfessionalPortfolioUpdated',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: offer.application.professionalProfileId,
          correlationId,
          payload: {
            professionalProfileId: offer.application.professionalProfileId,
            sourceType: 'employment',
            sourceId: id,
          },
        },
      ]);
      return employment;
    });
  }

  async activateEmployment(
    accountId: string,
    organizationId: string,
    employmentId: string,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const employment = await this.requireOrganizationEmployment(
      organizationId,
      employmentId,
    );
    if (employment.status !== 'CONFIRMED')
      throw new ConflictException(
        'Only confirmed upcoming employment can be activated',
      );
    if (employment.startDate > new Date())
      throw new ConflictException(
        'Employment cannot be activated before its start date',
      );
    return this.changeEmploymentStatus(
      accountId,
      employment,
      'ACTIVE',
      undefined,
      correlationId,
    );
  }

  async endEmployment(
    accountId: string,
    organizationId: string,
    employmentId: string,
    dto: EndEmploymentDto,
    correlationId: string,
  ) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    const employment = await this.requireOrganizationEmployment(
      organizationId,
      employmentId,
    );
    if (!['CONFIRMED', 'ACTIVE'].includes(employment.status))
      throw new ConflictException('Employment is already in a terminal state');
    const endDate = new Date(dto.endDate);
    if (employment.status === 'ACTIVE' && endDate < employment.startDate)
      throw new ConflictException(
        'Employment end date cannot precede its start date',
      );
    if (endDate > new Date())
      throw new ConflictException(
        'Employment end date cannot be in the future',
      );
    const status =
      employment.status === 'CONFIRMED'
        ? ('CANCELLED' as const)
        : ('ENDED' as const);
    return this.changeEmploymentStatus(
      accountId,
      employment,
      status,
      { endDate, reason: dto.reason.trim() },
      correlationId,
    );
  }

  async listOrganizationEmployments(accountId: string, organizationId: string) {
    await this.requireRecruitmentAccess(accountId, organizationId);
    return this.prisma.employment.findMany({
      where: { organizationId },
      select: {
        ...this.employmentSelect(),
        professional: {
          select: {
            id: true,
            displayName: true,
            countryCode: true,
            account: { select: { email: true } },
          },
        },
        history: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            reason: true,
            createdAt: true,
          },
        },
      },
      orderBy: { confirmedAt: 'desc' },
    });
  }

  async listMyEmployments(accountId: string) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional)
      throw new NotFoundException('Professional profile not found');
    return this.prisma.employment.findMany({
      where: { professionalProfileId: professional.id },
      select: {
        ...this.employmentSelect(),
        organization: {
          select: { id: true, legalName: true, publicName: true, status: true },
        },
        history: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            reason: true,
            createdAt: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async discoverCandidates(
    accountId: string,
    organizationId: string,
    query: CandidateSearchQueryDto,
  ) {
    const access = await this.requireRecruitmentAccess(
      accountId,
      organizationId,
    );
    if (access.status !== 'VERIFIED')
      throw new ForbiddenException(
        'Candidate discovery requires a verified organization',
      );
    return this.prisma.professionalProfile
      .findMany({
        where: {
          status: { in: ['DRAFT', 'ACTIVE'] },
          ...(query.countryCode
            ? { countryCode: query.countryCode.toUpperCase() }
            : {}),
          ...(query.q
            ? {
                displayName: {
                  contains: query.q,
                  mode: 'insensitive' as const,
                },
              }
            : {}),
        },
        select: {
          id: true,
          displayName: true,
          countryCode: true,
          status: true,
          account: { select: { email: true } },
        },
        orderBy: { displayName: 'asc' },
        take: 50,
      })
      .then(async (profiles) => {
        const credentials = await this.prisma.credential.findMany({
          where: {
            professionalProfileId: { in: profiles.map((item) => item.id) },
            status: 'VERIFIED',
            ...(query.credentialType
              ? { typeCode: query.credentialType.toUpperCase() }
              : {}),
          },
          select: {
            id: true,
            professionalProfileId: true,
            typeCode: true,
            title: true,
            issuingOrganization: true,
            countryCode: true,
            expiryDate: true,
          },
        });
        const grouped = new Map<string, typeof credentials>();
        for (const credential of credentials)
          grouped.set(credential.professionalProfileId, [
            ...(grouped.get(credential.professionalProfileId) ?? []),
            credential,
          ]);
        return profiles
          .map((profile) => ({
            ...profile,
            verifiedCredentials: grouped.get(profile.id) ?? [],
          }))
          .filter((profile) => profile.verifiedCredentials.length > 0);
      });
  }

  private async requireRecruitmentAccess(
    accountId: string,
    organizationId: string,
  ) {
    const access = await this.organizations.findAccess(
      accountId,
      organizationId,
    );
    if (!access) throw new NotFoundException('Organization not found');
    if (!['OWNER', 'ADMIN', 'RECRUITER'].includes(access.role))
      throw new ForbiddenException('Recruitment access is required');
    return access;
  }
  private async requireOrganizationJob(organizationId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, organizationId },
      select: jobSelect,
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }
  private async requireOrganizationApplication(
    organizationId: string,
    applicationId: string,
  ) {
    const application = await this.prisma.jobApplication.findFirst({
      where: { id: applicationId, job: { organizationId } },
      select: {
        id: true,
        jobId: true,
        status: true,
        professional: { select: { accountId: true } },
        job: { select: { title: true } },
      },
    });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }
  private async requireOrganizationOffer(
    organizationId: string,
    offerId: string,
  ) {
    const offer = await this.prisma.jobOffer.findFirst({
      where: { id: offerId, application: { job: { organizationId } } },
      select: {
        ...this.offerSelect(),
        application: {
          select: {
            id: true,
            jobId: true,
            status: true,
            professionalProfileId: true,
            professional: { select: { accountId: true } },
            job: { select: { title: true } },
          },
        },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }
  private async requireOrganizationEmployment(
    organizationId: string,
    employmentId: string,
  ) {
    const employment = await this.prisma.employment.findFirst({
      where: { id: employmentId, organizationId },
      select: {
        ...this.employmentSelect(),
        professional: { select: { accountId: true } },
      },
    });
    if (!employment) throw new NotFoundException('Employment not found');
    return employment;
  }
  private async changeEmploymentStatus(
    accountId: string,
    employment: Awaited<
      ReturnType<RecruitmentService['requireOrganizationEmployment']>
    >,
    status: 'ACTIVE' | 'ENDED' | 'CANCELLED',
    details: { endDate: Date; reason: string } | undefined,
    correlationId: string,
  ) {
    const occurredAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.employment.update({
        where: { id: employment.id },
        data: {
          status,
          ...(details ? { endDate: details.endDate } : {}),
          history: {
            create: {
              fromStatus: employment.status,
              toStatus: status,
              actorAccountId: accountId,
              reason: details?.reason,
            },
          },
        },
        select: this.employmentSelect(),
      });
      await transaction.notification.create({
        data: {
          recipientAccountId: employment.professional.accountId,
          kind:
            status === 'ACTIVE' ? 'EMPLOYMENT_CONFIRMED' : 'EMPLOYMENT_ENDED',
          title:
            status === 'ACTIVE'
              ? 'Employment started'
              : status === 'ENDED'
                ? 'Employment ended'
                : 'Employment cancelled',
          message:
            details?.reason ??
            `${employment.title} is now active in your verified record.`,
          resourceType: 'employment',
          resourceId: employment.id,
        },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: `recruitment.employment.${status.toLowerCase()}`,
        resourceType: 'employment',
        resourceId: employment.id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        reason: details?.reason,
        changes: { status: { from: employment.status, to: status } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name:
            status === 'ACTIVE'
              ? 'EmploymentActivated'
              : status === 'ENDED'
                ? 'EmploymentEnded'
                : 'EmploymentCancelled',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: employment.id,
          correlationId,
          payload: {
            employmentId: employment.id,
            professionalProfileId: employment.professionalProfileId,
            organizationId: employment.organizationId,
          },
        },
        {
          id: randomUUID(),
          name: 'ProfessionalPortfolioUpdated',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: employment.professionalProfileId,
          correlationId,
          payload: {
            professionalProfileId: employment.professionalProfileId,
            sourceType: 'employment',
            sourceId: employment.id,
          },
        },
      ]);
      return updated;
    });
  }
  private async assertNoActiveOffer(applicationId: string) {
    const active = await this.prisma.jobOffer.findFirst({
      where: { applicationId, status: { in: ['DRAFT', 'SENT', 'ACCEPTED'] } },
      select: { id: true },
    });
    if (active)
      throw new ConflictException(
        'This application already has an active offer',
      );
  }
  private validateOfferDates(
    proposedStartDateValue: string,
    expiresAtValue: string,
  ) {
    const proposedStartDate = new Date(proposedStartDateValue);
    const expiresAt = new Date(expiresAtValue);
    const now = new Date();
    if (expiresAt <= now)
      throw new ConflictException('Offer expiry must be in the future');
    if (proposedStartDate <= now)
      throw new ConflictException('Proposed start date must be in the future');
  }
  private interviewSelect() {
    return {
      id: true,
      applicationId: true,
      scheduledByAccountId: true,
      startsAt: true,
      endsAt: true,
      timeZone: true,
      mode: true,
      location: true,
      joinUrl: true,
      notes: true,
      status: true,
      cancellationReason: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }
  private offerSelect() {
    return {
      id: true,
      applicationId: true,
      createdByAccountId: true,
      salaryMonthly: true,
      currencyCode: true,
      proposedStartDate: true,
      expiresAt: true,
      terms: true,
      status: true,
      sentAt: true,
      respondedAt: true,
      responseReason: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }
  private employmentSelect() {
    return {
      id: true,
      offerId: true,
      jobId: true,
      organizationId: true,
      professionalProfileId: true,
      confirmedByAccountId: true,
      title: true,
      employmentType: true,
      startDate: true,
      endDate: true,
      status: true,
      verificationSource: true,
      confirmedAt: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }
  private validateCompensation(
    dto: Pick<
      CreateJobDto,
      'salaryMinMonthly' | 'salaryMaxMonthly' | 'currencyCode'
    >,
  ) {
    if (
      (dto.salaryMinMonthly !== undefined ||
        dto.salaryMaxMonthly !== undefined) &&
      !dto.currencyCode
    )
      throw new ConflictException(
        'Currency is required when compensation is provided',
      );
    if (
      dto.salaryMinMonthly !== undefined &&
      dto.salaryMaxMonthly !== undefined &&
      dto.salaryMaxMonthly < dto.salaryMinMonthly
    )
      throw new ConflictException(
        'Maximum compensation must be at least the minimum',
      );
  }

  private isPrismaUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
