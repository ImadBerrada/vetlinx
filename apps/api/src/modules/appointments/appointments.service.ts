import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../platform/persistence/prisma.service';
import {
  OUTBOX_WRITER,
  type OutboxWriter,
} from '../../platform/events/outbox-writer.port';
import { AuditService } from '../audit/audit.service';
import {
  OWNERS_PUBLIC_API,
  type OwnersPublicApi,
} from '../owners/owners.public';
import {
  ORGANIZATIONS_PUBLIC_API,
  type OrganizationsPublicApi,
} from '../organizations/organizations.public';
import {
  NOTIFICATIONS_PUBLIC_API,
  type NotificationsPublicApi,
} from '../notifications/notifications.public';
import type {
  AppointmentDecisionDto,
  AppointmentProposalDto,
  AppointmentProposalResponseDto,
  RequestAppointmentDto,
} from './appointments.dto';

const appointmentSelect = {
  id: true,
  requesterAccountId: true,
  organizationId: true,
  petId: true,
  petName: true,
  speciesCode: true,
  ownerName: true,
  contactPhone: true,
  clinicName: true,
  startsAt: true,
  timeZone: true,
  visitReason: true,
  sharingConsentAt: true,
  status: true,
  responseNote: true,
  createdAt: true,
  updatedAt: true,
  proposedStartsAt: true,
  proposedTimeZone: true,
  proposalExpiresAt: true,
  proposalVersion: true,
  proposalReason: true,
  history: {
    select: {
      fromStatus: true,
      toStatus: true,
      reason: true,
      createdAt: true,
      action: true,
      proposedStartsAt: true,
      proposedTimeZone: true,
      proposalVersion: true,
      proposalExpiresAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(OWNERS_PUBLIC_API) private readonly owners: OwnersPublicApi,
    @Inject(ORGANIZATIONS_PUBLIC_API)
    private readonly organizations: OrganizationsPublicApi,
    @Inject(NOTIFICATIONS_PUBLIC_API)
    private readonly notifications: NotificationsPublicApi,
  ) {}

  listMine(accountId: string) {
    return this.prisma.appointment.findMany({
      where: { requesterAccountId: accountId },
      select: appointmentSelect,
      orderBy: { startsAt: 'desc' },
      take: 100,
    });
  }

  async listForClinic(accountId: string, organizationId: string) {
    await this.requireClinicAccess(accountId, organizationId);
    return this.prisma.appointment.findMany({
      where: { organizationId },
      select: appointmentSelect,
      orderBy: { startsAt: 'desc' },
      take: 100,
    });
  }

  async request(
    accountId: string,
    dto: RequestAppointmentDto,
    correlationId: string,
  ) {
    const existing = await this.prisma.appointment.findUnique({
      where: { id: dto.requestId },
      select: appointmentSelect,
    });
    if (existing) return this.replay(existing, accountId, dto);
    const startsAt = new Date(dto.startsAt);
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date())
      throw new BadRequestException('Choose a future appointment time');
    try {
      new Intl.DateTimeFormat('en', { timeZone: dto.timeZone }).format(
        startsAt,
      );
    } catch {
      throw new BadRequestException('Choose a valid time zone');
    }
    if (dto.sharingConsent !== true)
      throw new BadRequestException('Sharing consent is required');
    const pet = await this.owners.findPetForBooking(accountId, dto.petId);
    if (!pet) throw new NotFoundException('Pet not found');
    const clinic = await this.organizations.findBookableClinic(
      dto.organizationId,
    );
    if (!clinic)
      throw new ConflictException(
        'This clinic is not accepting appointment requests',
      );
    const recipients = await this.organizations.appointmentRecipients(
      clinic.id,
    );
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const appointment = await tx.appointment.create({
          data: {
            id: dto.requestId,
            requesterAccountId: accountId,
            ownerProfileId: pet.ownerProfileId,
            petId: pet.id,
            organizationId: clinic.id,
            ownerName: pet.ownerName,
            contactPhone: pet.contactPhone,
            petName: pet.name,
            speciesCode: pet.speciesCode,
            clinicName: clinic.publicName ?? clinic.legalName,
            startsAt,
            timeZone: dto.timeZone,
            visitReason: dto.visitReason.trim(),
            sharingConsentAt: now,
            history: {
              create: {
                actorAccountId: accountId,
                toStatus: 'REQUESTED',
                action: 'REQUESTED',
                proposedStartsAt: startsAt,
                proposedTimeZone: dto.timeZone,
              },
            },
          },
          select: appointmentSelect,
        });
        await this.audit.recordInTransaction(tx, {
          actorId: accountId,
          action: 'appointment.requested',
          resourceType: 'appointment',
          resourceId: appointment.id,
          occurredAt: now.toISOString(),
          correlationId,
          changes: { status: { to: 'REQUESTED' }, organizationId: clinic.id },
        });
        await this.outbox.enqueue(tx, [
          {
            id: randomUUID(),
            name: 'AppointmentRequested',
            version: 1,
            aggregateId: appointment.id,
            occurredAt: now.toISOString(),
            correlationId,
            payload: {
              appointmentId: appointment.id,
              organizationId: clinic.id,
            },
          },
        ]);
        await this.notifications.enqueue(tx, recipients, {
          kind: 'APPOINTMENT_REQUESTED',
          title: 'New appointment request',
          message:
            'A pet owner requested an appointment. Review it in the clinic workspace.',
          resourceType: 'appointment',
          resourceId: appointment.id,
        });
        return appointment;
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const saved = await this.prisma.appointment.findUnique({
          where: { id: dto.requestId },
          select: appointmentSelect,
        });
        if (saved) return this.replay(saved, accountId, dto);
      }
      throw error;
    }
  }

  async cancelMine(
    accountId: string,
    appointmentId: string,
    correlationId: string,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, requesterAccountId: accountId },
      select: appointmentSelect,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.status === 'CANCELLED') return appointment;
    if (!['REQUESTED', 'CONFIRMED'].includes(appointment.status))
      throw new ConflictException(
        'This appointment can no longer be cancelled',
      );
    return this.change(
      accountId,
      appointment,
      { status: 'CANCELLED', reason: 'Cancelled by pet owner' },
      correlationId,
    );
  }

  async decide(
    accountId: string,
    organizationId: string,
    appointmentId: string,
    dto: AppointmentDecisionDto,
    correlationId: string,
  ) {
    await this.requireClinicAccess(accountId, organizationId);
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId },
      select: appointmentSelect,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    const allowed =
      appointment.status === 'REQUESTED'
        ? ['CONFIRMED', 'DECLINED']
        : appointment.status === 'CONFIRMED'
          ? ['CANCELLED', 'COMPLETED']
          : [];
    if (!allowed.includes(dto.status))
      throw new ConflictException('Appointment cannot change to this status');
    if (
      ['CONFIRMED', 'COMPLETED'].includes(dto.status) &&
      appointment.proposalExpiresAt &&
      appointment.proposalExpiresAt > new Date()
    )
      throw new ConflictException(
        'The pet owner must respond to the proposed time first',
      );
    if (dto.status === 'CONFIRMED' && appointment.startsAt <= new Date())
      throw new ConflictException(
        'The requested time has passed. Decline it and ask the owner to request a new time.',
      );
    if (dto.status === 'COMPLETED' && appointment.startsAt > new Date())
      throw new ConflictException('A future appointment cannot be completed');
    if (['DECLINED', 'CANCELLED'].includes(dto.status) && !dto.reason?.trim())
      throw new BadRequestException('Provide a reason for the pet owner');
    return this.change(accountId, appointment, dto, correlationId);
  }

  async propose(
    accountId: string,
    organizationId: string,
    appointmentId: string,
    dto: AppointmentProposalDto,
    correlationId: string,
  ) {
    await this.requireClinicAccess(accountId, organizationId);
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId },
      select: appointmentSelect,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    const startsAt = new Date(dto.startsAt);
    const expiresAt = new Date(dto.expiresAt);
    const now = new Date();
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= now)
      throw new BadRequestException('Choose a future proposed time');
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt <= now ||
      expiresAt > startsAt ||
      (appointment.status === 'CONFIRMED' && expiresAt > appointment.startsAt)
    )
      throw new BadRequestException(
        'The response deadline must be in the future and no later than the proposed time or an existing confirmed time',
      );
    try {
      new Intl.DateTimeFormat('en', { timeZone: dto.timeZone }).format(
        startsAt,
      );
    } catch {
      throw new BadRequestException('Choose a valid time zone');
    }
    if (!dto.reason.trim())
      throw new BadRequestException(
        'Explain the proposed change to the pet owner',
      );
    if (!['REQUESTED', 'CONFIRMED'].includes(appointment.status))
      throw new ConflictException(
        'This appointment cannot receive a proposed time',
      );
    if (appointment.status === 'CONFIRMED' && appointment.startsAt <= now)
      throw new ConflictException(
        'An elapsed confirmed appointment cannot be rescheduled',
      );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          status: appointment.status,
          proposalVersion: dto.proposalVersion,
        },
        data: {
          proposedStartsAt: startsAt,
          proposedTimeZone: dto.timeZone,
          proposalExpiresAt: expiresAt,
          proposalReason: dto.reason.trim(),
          proposedByAccountId: accountId,
          proposalVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'The appointment or proposal changed. Refresh and try again.',
        );
      const saved = await tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        select: appointmentSelect,
      });
      // Append legacy request times before rescheduling; keep existing history intact.
      if (
        !appointment.history.some(
          (item) =>
            ['REQUESTED', 'REQUEST_SNAPSHOT'].includes(item.action) &&
            item.proposedStartsAt,
        )
      ) {
        await tx.appointmentHistory.create({
          data: {
            appointmentId: appointment.id,
            actorAccountId: accountId,
            fromStatus: appointment.status,
            toStatus: appointment.status,
            action: 'REQUEST_SNAPSHOT',
            proposedStartsAt: appointment.startsAt,
            proposedTimeZone: appointment.timeZone,
          },
        });
      }
      await this.proposalRecord(
        tx,
        accountId,
        saved,
        'PROPOSED',
        correlationId,
        [appointment.requesterAccountId],
        dto.reason.trim(),
      );
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        select: appointmentSelect,
      });
    });
  }

  async respondToProposal(
    accountId: string,
    appointmentId: string,
    dto: AppointmentProposalResponseDto,
    accept: boolean,
    correlationId: string,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, requesterAccountId: accountId },
      select: appointmentSelect,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (
      !['REQUESTED', 'CONFIRMED'].includes(appointment.status) ||
      !appointment.proposedStartsAt ||
      !appointment.proposedTimeZone ||
      !appointment.proposalExpiresAt ||
      appointment.proposalVersion !== dto.proposalVersion
    )
      throw new ConflictException(
        'This proposed time is no longer available. Refresh the appointment.',
      );
    const now = new Date();
    const expired =
      appointment.proposalExpiresAt <= now ||
      appointment.proposedStartsAt <= now;
    if (accept && expired)
      throw new ConflictException(
        'This proposed time expired. The original appointment is unchanged. Contact the clinic for a new proposal.',
      );
    const recipients = await this.organizations.appointmentRecipients(
      appointment.organizationId,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          requesterAccountId: accountId,
          status: appointment.status,
          proposalVersion: dto.proposalVersion,
          proposedStartsAt: appointment.proposedStartsAt,
          ...(accept ? { proposalExpiresAt: { gt: now } } : {}),
        },
        data: {
          ...this.clearProposal(),
          proposalVersion: { increment: 1 },
          ...(accept
            ? {
                startsAt: appointment.proposedStartsAt!,
                timeZone: appointment.proposedTimeZone!,
                status: 'CONFIRMED' as const,
                responseNote: 'Pet owner accepted the clinic’s proposed time',
              }
            : {}),
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'The appointment or proposal changed. Refresh and try again.',
        );
      await this.proposalRecord(
        tx,
        accountId,
        appointment,
        accept
          ? 'PROPOSAL_ACCEPTED'
          : expired
            ? 'PROPOSAL_EXPIRED'
            : 'PROPOSAL_REJECTED',
        correlationId,
        recipients,
      );
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        select: appointmentSelect,
      });
    });
  }

  private clearProposal() {
    return {
      proposedStartsAt: null,
      proposedTimeZone: null,
      proposalExpiresAt: null,
      proposedByAccountId: null,
      proposalReason: null,
    };
  }

  private async proposalRecord(
    tx: Prisma.TransactionClient,
    accountId: string,
    appointment: Awaited<ReturnType<AppointmentsService['listMine']>>[number],
    action: string,
    correlationId: string,
    recipients: string[],
    reason?: string,
  ) {
    const now = new Date();
    await tx.appointmentHistory.create({
      data: {
        appointmentId: appointment.id,
        actorAccountId: accountId,
        fromStatus: appointment.status,
        toStatus:
          action === 'PROPOSAL_ACCEPTED' ? 'CONFIRMED' : appointment.status,
        action,
        reason: reason ?? appointment.proposalReason,
        proposedStartsAt: appointment.proposedStartsAt,
        proposedTimeZone: appointment.proposedTimeZone,
        proposalVersion: appointment.proposalVersion,
        proposalExpiresAt: appointment.proposalExpiresAt,
      },
    });
    await this.audit.recordInTransaction(tx, {
      actorId: accountId,
      action: `appointment.${action.toLowerCase()}`,
      resourceType: 'appointment',
      resourceId: appointment.id,
      occurredAt: now.toISOString(),
      correlationId,
      changes: {
        proposalVersion: appointment.proposalVersion,
        proposedStartsAt: appointment.proposedStartsAt?.toISOString(),
        proposalExpiresAt: appointment.proposalExpiresAt?.toISOString(),
      },
    });
    await this.outbox.enqueue(tx, [
      {
        id: randomUUID(),
        name:
          action === 'PROPOSED'
            ? 'AppointmentTimeProposed'
            : action === 'PROPOSAL_ACCEPTED'
              ? 'AppointmentTimeAccepted'
              : 'AppointmentTimeProposalClosed',
        version: 1,
        aggregateId: appointment.id,
        occurredAt: now.toISOString(),
        correlationId,
        payload: {
          appointmentId: appointment.id,
          organizationId: appointment.organizationId,
          proposalVersion: appointment.proposalVersion,
          action,
        },
      },
    ]);
    await this.notifications.enqueue(tx, recipients, {
      kind: 'APPOINTMENT_UPDATED',
      title:
        action === 'PROPOSED'
          ? 'Clinic proposed a new time'
          : action === 'PROPOSAL_ACCEPTED'
            ? 'Proposed time accepted'
            : 'Proposed time closed',
      message: 'Open the appointment in your workspace to review the update.',
      resourceType: 'appointment',
      resourceId: appointment.id,
    });
  }

  private async change(
    accountId: string,
    appointment: Awaited<ReturnType<AppointmentsService['listMine']>>[number],
    dto: AppointmentDecisionDto,
    correlationId: string,
  ) {
    const recipients =
      accountId === appointment.requesterAccountId
        ? await this.organizations.appointmentRecipients(
            appointment.organizationId,
          )
        : [appointment.requesterAccountId];
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          status: appointment.status,
          proposalVersion: appointment.proposalVersion,
        },
        data: {
          status: dto.status,
          responseNote: dto.reason?.trim() || null,
          ...this.clearProposal(),
          proposalVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Appointment was updated by someone else. Refresh and try again.',
        );
      await tx.appointmentHistory.create({
        data: {
          appointmentId: appointment.id,
          actorAccountId: accountId,
          fromStatus: appointment.status,
          toStatus: dto.status,
          reason: dto.reason?.trim() || null,
          action: 'STATUS_CHANGED',
        },
      });
      await this.audit.recordInTransaction(tx, {
        actorId: accountId,
        action: `appointment.${dto.status.toLowerCase()}`,
        resourceType: 'appointment',
        resourceId: appointment.id,
        occurredAt: now.toISOString(),
        correlationId,
        changes: { status: { from: appointment.status, to: dto.status } },
      });
      await this.outbox.enqueue(tx, [
        {
          id: randomUUID(),
          name: 'AppointmentStatusChanged',
          version: 1,
          aggregateId: appointment.id,
          occurredAt: now.toISOString(),
          correlationId,
          payload: {
            appointmentId: appointment.id,
            organizationId: appointment.organizationId,
            status: dto.status,
          },
        },
      ]);
      await this.notifications.enqueue(tx, recipients, {
        kind: 'APPOINTMENT_UPDATED',
        title: `Appointment ${dto.status.toLowerCase()}`,
        message:
          'An appointment request changed. Open your workspace for its details.',
        resourceType: 'appointment',
        resourceId: appointment.id,
      });
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        select: appointmentSelect,
      });
    });
  }

  private replay(
    appointment: Awaited<ReturnType<AppointmentsService['listMine']>>[number],
    accountId: string,
    dto: RequestAppointmentDto,
  ) {
    if (
      appointment.requesterAccountId !== accountId ||
      appointment.petId !== dto.petId ||
      appointment.organizationId !== dto.organizationId ||
      (
        appointment.history.find(
          (item) =>
            ['REQUESTED', 'REQUEST_SNAPSHOT'].includes(item.action) &&
            item.proposedStartsAt,
        )?.proposedStartsAt ?? appointment.startsAt
      ).getTime() !== new Date(dto.startsAt).getTime() ||
      appointment.visitReason !== dto.visitReason.trim() ||
      (appointment.history.find(
        (item) =>
          ['REQUESTED', 'REQUEST_SNAPSHOT'].includes(item.action) &&
          item.proposedTimeZone,
      )?.proposedTimeZone ?? appointment.timeZone) !== dto.timeZone ||
      dto.sharingConsent !== true
    )
      throw new ConflictException(
        'This request identifier has already been used. Start a new request.',
      );
    return appointment;
  }

  private async requireClinicAccess(accountId: string, organizationId: string) {
    const access = await this.organizations.findAccess(
      accountId,
      organizationId,
    );
    if (
      !access ||
      access.status !== 'VERIFIED' ||
      !['OWNER', 'ADMIN', 'STAFF'].includes(access.role)
    )
      throw new ForbiddenException(
        'Verified clinic owner, admin, or staff access is required',
      );
  }
}
