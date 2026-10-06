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
import { SchedulingService } from './scheduling.service';
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
  AppointmentRescheduleResponseDto,
  AppointmentVersionDto,
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
  proposalInitiator: true,
  checkedInAt: true,
  slotId: true,
  proposedSlotId: true,
  requestHoldId: true,
  serviceName: true,
  durationMinutes: true,
  slot: { select: { serviceId: true } },
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
      proposalInitiator: true,
      slotId: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scheduling: SchedulingService,
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
        const clinic = await this.organizations.lockBookableClinic(
          tx,
          dto.organizationId,
        );
        if (!clinic)
          throw new ConflictException(
            'This clinic is no longer accepting requests',
          );
        const pet = await this.owners.findPetForBooking(
          accountId,
          dto.petId,
          tx,
        );
        if (!pet)
          throw new NotFoundException('Pet is archived or no longer available');
        if (startsAt <= new Date())
          throw new ConflictException('The requested time has passed');
        if (clinic.appointmentSchedulingEnabled && !dto.holdId)
          throw new ConflictException(
            'Choose a published clinic time before sending this request',
          );
        const held = dto.holdId
          ? await this.scheduling.consume(
              tx,
              accountId,
              clinic.id,
              pet.id,
              dto.holdId,
              startsAt,
              dto.timeZone,
            )
          : null;
        const appointment = await tx.appointment.create({
          data: {
            id: dto.requestId,
            requestHoldId: dto.holdId ?? null,
            slotId: held?.id ?? null,
            serviceName: held?.service.name ?? null,
            durationMinutes: held?.service.durationMinutes ?? null,
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
                slotId: held?.id ?? null,
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
        error instanceof ConflictException ||
        (typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2002')
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
    proposalVersion?: number,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, requesterAccountId: accountId },
      select: appointmentSelect,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.status === 'CANCELLED') return appointment;
    if (appointment.checkedInAt)
      throw new ConflictException(
        'You have already checked in. Ask the clinic to change this appointment.',
      );
    if (
      proposalVersion !== undefined &&
      proposalVersion !== appointment.proposalVersion
    )
      throw new ConflictException(
        'The appointment changed. Refresh before cancelling.',
      );
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
    if (dto.status === 'NO_SHOW') {
      if (dto.proposalVersion === undefined)
        throw new BadRequestException(
          'Refresh the appointment and provide its proposal version before recording a no-show',
        );
      if ((dto.reason?.trim().length ?? 0) < 3)
        throw new BadRequestException(
          'Provide a no-show note of at least three characters',
        );
      if (appointment.status === 'NO_SHOW')
        return this.change(
          accountId,
          appointment,
          dto,
          correlationId,
          organizationId,
        );
    }
    if (
      dto.proposalVersion !== undefined &&
      dto.proposalVersion !== appointment.proposalVersion
    )
      throw new ConflictException(
        'The appointment changed. Refresh and try again.',
      );
    const allowed =
      appointment.status === 'REQUESTED'
        ? ['CONFIRMED', 'DECLINED']
        : appointment.status === 'CONFIRMED'
          ? ['CANCELLED', 'COMPLETED', 'NO_SHOW']
          : [];
    if (!allowed.includes(dto.status))
      throw new ConflictException('Appointment cannot change to this status');
    if (
      ['CONFIRMED', 'COMPLETED', 'NO_SHOW'].includes(dto.status) &&
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
    if (
      dto.status === 'NO_SHOW' &&
      (appointment.checkedInAt || appointment.startsAt > new Date())
    )
      throw new ConflictException(
        'A no-show requires an elapsed confirmed appointment without a recorded arrival',
      );
    if (['DECLINED', 'CANCELLED'].includes(dto.status) && !dto.reason?.trim())
      throw new BadRequestException('Provide a reason for the pet owner');
    return this.change(
      accountId,
      appointment,
      dto,
      correlationId,
      organizationId,
    );
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
    if (appointment.checkedInAt)
      throw new ConflictException(
        'A checked-in appointment cannot receive time proposals',
      );
    if (
      appointment.proposalInitiator === 'OWNER' &&
      this.liveProposal(appointment, now)
    )
      throw new ConflictException(
        'Respond to the pet owner’s reschedule request before proposing another time',
      );
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= now)
      throw new BadRequestException('Choose a future proposed time');
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt <= now ||
      expiresAt.getTime() > now.getTime() + 7 * 86400000 ||
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
      await this.organizations.lockAppointmentAccess(
        tx,
        accountId,
        organizationId,
      );
      const current = await this.lockedAppointment(tx, appointmentId, {
        organizationId,
      });
      this.requireVersion(current, dto.proposalVersion);
      const lockedAt = new Date();
      if (
        current.checkedInAt ||
        (current.proposalInitiator === 'OWNER' &&
          this.liveProposal(current, lockedAt))
      )
        throw new ConflictException(
          'The appointment has an arrival or an owner reschedule request. Refresh and respond to it first.',
        );
      if (
        startsAt <= lockedAt ||
        expiresAt <= lockedAt ||
        (appointment.status === 'CONFIRMED' && appointment.startsAt <= lockedAt)
      )
        throw new ConflictException(
          'The appointment or proposal time has passed. Refresh and try again.',
        );
      const proposedSlotId = await this.scheduling.validateProposal(
        tx,
        organizationId,
        current.slotId,
        dto.slotId,
        startsAt,
        dto.timeZone,
      );
      if (expiresAt <= new Date())
        throw new ConflictException(
          'The proposal deadline passed while checking availability',
        );
      const updated = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          status: appointment.status,
          proposalVersion: dto.proposalVersion,
          checkedInAt: null,
        },
        data: {
          proposedStartsAt: startsAt,
          proposedTimeZone: dto.timeZone,
          proposalExpiresAt: expiresAt,
          proposalReason: dto.reason.trim(),
          proposedByAccountId: accountId,
          proposalInitiator: 'CLINIC',
          proposedSlotId,
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
    if (appointment.checkedInAt || appointment.proposalInitiator === 'OWNER')
      throw new ConflictException(
        'Only an unarrived clinic-origin proposal can be answered by the pet owner',
      );
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
      await tx.$queryRaw`SELECT id FROM appointments.appointments WHERE id = ${appointment.id}::uuid FOR UPDATE`;
      if (accept)
        await this.scheduling.validateProposal(
          tx,
          appointment.organizationId,
          appointment.slotId,
          appointment.proposedSlotId ?? undefined,
          appointment.proposedStartsAt!,
          appointment.proposedTimeZone!,
        );
      const lockedAt = new Date();
      if (
        accept &&
        (appointment.proposalExpiresAt! <= lockedAt ||
          appointment.proposedStartsAt! <= lockedAt)
      )
        throw new ConflictException(
          'This proposed time expired. The original appointment is unchanged.',
        );
      const updated = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          requesterAccountId: accountId,
          status: appointment.status,
          proposalVersion: dto.proposalVersion,
          proposedStartsAt: appointment.proposedStartsAt,
          checkedInAt: null,
          ...(accept ? { proposalExpiresAt: { gt: lockedAt } } : {}),
        },
        data: {
          ...this.clearProposal(),
          proposalVersion: { increment: 1 },
          ...(accept
            ? {
                startsAt: appointment.proposedStartsAt!,
                slotId: appointment.proposedSlotId ?? appointment.slotId,
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

  async requestReschedule(
    accountId: string,
    appointmentId: string,
    dto: AppointmentProposalDto,
    correlationId: string,
  ) {
    const startsAt = new Date(dto.startsAt);
    const expiresAt = new Date(dto.expiresAt);
    const reason = dto.reason.trim();
    const recipients = await this.clinicRecipientsForOwned(
      accountId,
      appointmentId,
    );
    return this.prisma.$transaction(async (tx) => {
      const appointment = await this.lockedAppointment(tx, appointmentId, {
        requesterAccountId: accountId,
      });
      if (
        appointment.proposalVersion === dto.proposalVersion + 1 &&
        appointment.proposalInitiator === 'OWNER' &&
        appointment.proposedStartsAt?.getTime() === startsAt.getTime() &&
        appointment.proposedTimeZone === dto.timeZone &&
        appointment.proposalExpiresAt?.getTime() === expiresAt.getTime() &&
        appointment.proposalReason === reason &&
        appointment.proposedSlotId === (dto.slotId ?? null) &&
        (await this.commandHistory(
          tx,
          accountId,
          appointmentId,
          'OWNER_RESCHEDULE_REQUESTED',
          dto.proposalVersion + 1,
        ))
      )
        return appointment;
      this.requireVersion(appointment, dto.proposalVersion);
      const now = new Date();
      this.requireReschedulable(appointment, now);
      if (
        this.liveProposal(appointment, now) &&
        appointment.proposalInitiator !== 'OWNER'
      )
        throw new ConflictException(
          'Respond to the clinic’s proposed time before requesting a different time',
        );
      this.validateRescheduleTime(appointment, dto, now);
      const proposedSlotId = await this.scheduling.validateProposal(
        tx,
        appointment.organizationId,
        appointment.slotId,
        dto.slotId,
        startsAt,
        dto.timeZone,
      );
      this.validateRescheduleTime(appointment, dto, new Date());
      await this.preserveRequestSnapshot(tx, accountId, appointment);
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          proposedStartsAt: startsAt,
          proposedTimeZone: dto.timeZone,
          proposalExpiresAt: expiresAt,
          proposalReason: reason,
          proposedByAccountId: accountId,
          proposalInitiator: 'OWNER',
          proposedSlotId,
          proposalVersion: { increment: 1 },
        },
      });
      const saved = await tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: appointmentSelect,
      });
      await this.proposalRecord(
        tx,
        accountId,
        saved,
        'OWNER_RESCHEDULE_REQUESTED',
        correlationId,
        recipients,
        reason,
      );
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: appointmentSelect,
      });
    });
  }

  async withdrawReschedule(
    accountId: string,
    appointmentId: string,
    dto: AppointmentProposalResponseDto,
    correlationId: string,
  ) {
    const recipients = await this.clinicRecipientsForOwned(
      accountId,
      appointmentId,
    );
    return this.prisma.$transaction(async (tx) => {
      const appointment = await this.lockedAppointment(tx, appointmentId, {
        requesterAccountId: accountId,
      });
      if (
        appointment.proposalVersion === dto.proposalVersion + 1 &&
        (await this.commandHistory(
          tx,
          accountId,
          appointmentId,
          'OWNER_RESCHEDULE_WITHDRAWN',
          dto.proposalVersion,
        ))
      )
        return appointment;
      this.requireVersion(appointment, dto.proposalVersion);
      if (
        appointment.status !== 'CONFIRMED' ||
        appointment.checkedInAt ||
        appointment.proposalInitiator !== 'OWNER' ||
        !appointment.proposedStartsAt
      )
        throw new ConflictException(
          'There is no owner reschedule request to withdraw',
        );
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { ...this.clearProposal(), proposalVersion: { increment: 1 } },
      });
      await this.proposalRecord(
        tx,
        accountId,
        appointment,
        'OWNER_RESCHEDULE_WITHDRAWN',
        correlationId,
        recipients,
      );
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: appointmentSelect,
      });
    });
  }

  async respondToReschedule(
    accountId: string,
    organizationId: string,
    appointmentId: string,
    dto: AppointmentRescheduleResponseDto,
    accept: boolean,
    correlationId: string,
  ) {
    await this.requireClinicAccess(accountId, organizationId);
    const reason = dto.reason?.trim() || null;
    if (!accept && (reason?.length ?? 0) < 3)
      throw new BadRequestException(
        'Explain the declined reschedule request in at least three characters',
      );
    const action = accept
      ? 'OWNER_RESCHEDULE_ACCEPTED'
      : 'OWNER_RESCHEDULE_DECLINED';
    return this.prisma.$transaction(async (tx) => {
      await this.organizations.lockAppointmentAccess(
        tx,
        accountId,
        organizationId,
      );
      const appointment = await this.lockedAppointment(tx, appointmentId, {
        organizationId,
      });
      if (
        appointment.proposalVersion === dto.proposalVersion + 1 &&
        (await this.commandHistory(
          tx,
          accountId,
          appointmentId,
          action,
          dto.proposalVersion,
          reason,
        ))
      )
        return appointment;
      this.requireVersion(appointment, dto.proposalVersion);
      const now = new Date();
      if (
        appointment.status !== 'CONFIRMED' ||
        appointment.checkedInAt ||
        appointment.proposalInitiator !== 'OWNER' ||
        !appointment.proposedStartsAt ||
        !appointment.proposedTimeZone ||
        !appointment.proposalExpiresAt
      )
        throw new ConflictException(
          'Only an unarrived confirmed appointment with an owner reschedule request can be answered',
        );
      if (
        accept &&
        (!this.liveProposal(appointment, now) || appointment.startsAt <= now)
      )
        throw new ConflictException(
          'This reschedule request expired. The confirmed appointment is unchanged.',
        );
      if (accept) {
        await this.scheduling.validateProposal(
          tx,
          organizationId,
          appointment.slotId,
          appointment.proposedSlotId ?? undefined,
          appointment.proposedStartsAt,
          appointment.proposedTimeZone,
        );
        if (
          !this.liveProposal(appointment, new Date()) ||
          appointment.startsAt <= new Date()
        )
          throw new ConflictException(
            'This reschedule request expired while checking availability. The confirmed appointment is unchanged.',
          );
      }
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          ...this.clearProposal(),
          proposalVersion: { increment: 1 },
          ...(accept
            ? {
                startsAt: appointment.proposedStartsAt,
                slotId: appointment.proposedSlotId ?? appointment.slotId,
                timeZone: appointment.proposedTimeZone,
                responseNote:
                  reason ||
                  'Clinic accepted the pet owner’s reschedule request',
              }
            : {}),
        },
      });
      await this.proposalRecord(
        tx,
        accountId,
        appointment,
        action,
        correlationId,
        [appointment.requesterAccountId],
        reason,
      );
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: appointmentSelect,
      });
    });
  }

  async checkIn(
    accountId: string,
    organizationId: string,
    appointmentId: string,
    dto: AppointmentVersionDto,
    correlationId: string,
  ) {
    await this.requireClinicAccess(accountId, organizationId);
    return this.prisma.$transaction(async (tx) => {
      await this.organizations.lockAppointmentAccess(
        tx,
        accountId,
        organizationId,
      );
      const appointment = await this.lockedAppointment(tx, appointmentId, {
        organizationId,
      });
      if (
        appointment.proposalVersion === dto.proposalVersion + 1 &&
        appointment.checkedInAt &&
        (await this.commandHistory(
          tx,
          accountId,
          appointmentId,
          'CHECKED_IN',
          dto.proposalVersion,
        ))
      )
        return appointment;
      this.requireVersion(appointment, dto.proposalVersion);
      const now = new Date();
      if (
        appointment.status !== 'CONFIRMED' ||
        appointment.checkedInAt ||
        this.liveProposal(appointment, now)
      )
        throw new ConflictException(
          'Check-in requires a confirmed appointment without an arrival or an active time proposal',
        );
      if (appointment.startsAt.getTime() > now.getTime() + 86400000)
        throw new ConflictException(
          'Record arrival within 24 hours before the scheduled start or after it',
        );
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          checkedInAt: now,
          ...this.clearProposal(),
          proposalVersion: { increment: 1 },
        },
      });
      await tx.appointmentHistory.create({
        data: {
          appointmentId,
          actorAccountId: accountId,
          fromStatus: appointment.status,
          toStatus: appointment.status,
          action: 'CHECKED_IN',
          proposalVersion: dto.proposalVersion,
          proposedStartsAt: appointment.startsAt,
          proposedTimeZone: appointment.timeZone,
          reason:
            'Arrival recorded by clinic staff; appointment remains confirmed',
        },
      });
      await this.audit.recordInTransaction(tx, {
        actorId: accountId,
        action: 'appointment.checked_in',
        resourceType: 'appointment',
        resourceId: appointmentId,
        occurredAt: now.toISOString(),
        correlationId,
        changes: {
          checkedInAt: now.toISOString(),
          proposalVersion: dto.proposalVersion,
        },
      });
      await this.outbox.enqueue(tx, [
        {
          id: randomUUID(),
          name: 'AppointmentCheckedIn',
          version: 1,
          aggregateId: appointmentId,
          occurredAt: now.toISOString(),
          correlationId,
          payload: { appointmentId, organizationId },
        },
      ]);
      await this.notifications.enqueue(tx, [appointment.requesterAccountId], {
        kind: 'APPOINTMENT_UPDATED',
        title: 'Arrival recorded',
        message:
          'Your clinic recorded your arrival. Open the appointment for its details.',
        resourceType: 'appointment',
        resourceId: appointmentId,
      });
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: appointmentSelect,
      });
    });
  }

  private async clinicRecipientsForOwned(
    accountId: string,
    appointmentId: string,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, requesterAccountId: accountId },
      select: { organizationId: true },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return this.organizations.appointmentRecipients(appointment.organizationId);
  }

  private async lockedAppointment(
    tx: Prisma.TransactionClient,
    id: string,
    scope: { requesterAccountId?: string; organizationId?: string },
  ) {
    await tx.$queryRaw`SELECT id FROM appointments.appointments WHERE id = ${id}::uuid FOR UPDATE`;
    const appointment = await tx.appointment.findFirst({
      where: { id, ...scope },
      select: appointmentSelect,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  private commandHistory(
    tx: Prisma.TransactionClient,
    actorAccountId: string,
    appointmentId: string,
    action: string,
    proposalVersion: number,
    reason?: string | null,
  ) {
    return tx.appointmentHistory.findFirst({
      where: {
        actorAccountId,
        appointmentId,
        action,
        proposalVersion,
        ...(reason !== undefined ? { reason } : {}),
      },
      select: { id: true },
    });
  }

  private liveProposal(
    appointment: Awaited<ReturnType<AppointmentsService['listMine']>>[number],
    now: Date,
  ) {
    return Boolean(
      appointment.proposedStartsAt &&
      appointment.proposalExpiresAt &&
      appointment.proposedStartsAt > now &&
      appointment.proposalExpiresAt > now,
    );
  }

  private requireVersion(
    appointment: Awaited<ReturnType<AppointmentsService['listMine']>>[number],
    version: number,
  ) {
    if (appointment.proposalVersion !== version)
      throw new ConflictException(
        'The appointment changed. Refresh and try again.',
      );
  }

  private requireReschedulable(
    appointment: Awaited<ReturnType<AppointmentsService['listMine']>>[number],
    now: Date,
  ) {
    if (
      appointment.status !== 'CONFIRMED' ||
      appointment.checkedInAt ||
      appointment.startsAt <= now
    )
      throw new ConflictException(
        'Only a future confirmed appointment without a recorded arrival can be rescheduled',
      );
  }

  private validateRescheduleTime(
    appointment: Awaited<ReturnType<AppointmentsService['listMine']>>[number],
    dto: AppointmentProposalDto,
    now: Date,
  ) {
    const startsAt = new Date(dto.startsAt);
    const expiresAt = new Date(dto.expiresAt);
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= now)
      throw new BadRequestException('Choose a future proposed time');
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt <= now ||
      expiresAt > startsAt ||
      expiresAt > appointment.startsAt ||
      expiresAt.getTime() > now.getTime() + 7 * 86400000
    )
      throw new BadRequestException(
        'The response deadline must be in the next seven days and no later than the confirmed or proposed time',
      );
    try {
      new Intl.DateTimeFormat('en', { timeZone: dto.timeZone }).format(
        startsAt,
      );
    } catch {
      throw new BadRequestException('Choose a valid time zone');
    }
    if (dto.reason.trim().length < 3 || dto.reason.trim().length > 1000)
      throw new BadRequestException(
        'Explain the requested change in 3 to 1000 characters',
      );
  }

  private async preserveRequestSnapshot(
    tx: Prisma.TransactionClient,
    accountId: string,
    appointment: Awaited<ReturnType<AppointmentsService['listMine']>>[number],
  ) {
    if (
      !appointment.history.some(
        (item) =>
          ['REQUESTED', 'REQUEST_SNAPSHOT'].includes(item.action) &&
          item.proposedStartsAt,
      )
    )
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

  private clearProposal() {
    return {
      proposedStartsAt: null,
      proposedTimeZone: null,
      proposalExpiresAt: null,
      proposedByAccountId: null,
      proposalReason: null,
      proposalInitiator: null,
      proposedSlotId: null,
    };
  }

  private async proposalRecord(
    tx: Prisma.TransactionClient,
    accountId: string,
    appointment: Awaited<ReturnType<AppointmentsService['listMine']>>[number],
    action: string,
    correlationId: string,
    recipients: string[],
    reason?: string | null,
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
        reason: reason !== undefined ? reason : appointment.proposalReason,
        proposedStartsAt: appointment.proposedStartsAt,
        proposedTimeZone: appointment.proposedTimeZone,
        proposalVersion: appointment.proposalVersion,
        proposalExpiresAt: appointment.proposalExpiresAt,
        slotId: appointment.proposedSlotId,
        proposalInitiator:
          appointment.proposalInitiator ??
          (appointment.proposedStartsAt ? 'CLINIC' : null),
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
        name: ['PROPOSED', 'OWNER_RESCHEDULE_REQUESTED'].includes(action)
          ? 'AppointmentTimeProposed'
          : ['PROPOSAL_ACCEPTED', 'OWNER_RESCHEDULE_ACCEPTED'].includes(action)
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
          proposalInitiator:
            appointment.proposalInitiator ??
            (appointment.proposedStartsAt ? 'CLINIC' : null),
        },
      },
    ]);
    await this.notifications.enqueue(tx, recipients, {
      kind: 'APPOINTMENT_UPDATED',
      title:
        action === 'OWNER_RESCHEDULE_REQUESTED'
          ? 'Pet owner requested a different time'
          : action === 'OWNER_RESCHEDULE_ACCEPTED'
            ? 'Clinic accepted the requested time'
            : action === 'OWNER_RESCHEDULE_DECLINED'
              ? 'Clinic declined the requested time'
              : action === 'OWNER_RESCHEDULE_WITHDRAWN'
                ? 'Pet owner withdrew the time request'
                : action === 'PROPOSED'
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
    clinicOrganizationId?: string,
  ) {
    const recipients = !clinicOrganizationId
      ? await this.organizations.appointmentRecipients(
          appointment.organizationId,
        )
      : [appointment.requesterAccountId];
    return this.prisma.$transaction(async (tx) => {
      if (clinicOrganizationId)
        await this.organizations.lockAppointmentAccess(
          tx,
          accountId,
          clinicOrganizationId,
        );
      const current = await this.lockedAppointment(
        tx,
        appointment.id,
        clinicOrganizationId
          ? { organizationId: clinicOrganizationId }
          : { requesterAccountId: accountId },
      );
      if (
        dto.status === 'NO_SHOW' &&
        current.status === 'NO_SHOW' &&
        dto.proposalVersion !== undefined &&
        current.proposalVersion === dto.proposalVersion + 1 &&
        (await this.commandHistory(
          tx,
          accountId,
          current.id,
          'STATUS_CHANGED',
          dto.proposalVersion,
          dto.reason?.trim() || null,
        ))
      )
        return current;
      this.requireVersion(
        current,
        dto.proposalVersion ?? appointment.proposalVersion,
      );
      if (current.status !== appointment.status)
        throw new ConflictException(
          'The appointment status changed. Refresh and try again.',
        );
      const now = new Date();
      if (!clinicOrganizationId && current.checkedInAt)
        throw new ConflictException(
          'You have already checked in. Ask the clinic to change this appointment.',
        );
      if (
        ['CONFIRMED', 'COMPLETED', 'NO_SHOW'].includes(dto.status) &&
        this.liveProposal(current, now)
      )
        throw new ConflictException(
          'Respond to the active time proposal first',
        );
      if (dto.status === 'CONFIRMED' && current.startsAt <= now)
        throw new ConflictException('The requested time has passed');
      if (dto.status === 'COMPLETED' && current.startsAt > now)
        throw new ConflictException('A future appointment cannot be completed');
      if (
        dto.status === 'NO_SHOW' &&
        (current.status !== 'CONFIRMED' ||
          current.checkedInAt ||
          current.startsAt > now)
      )
        throw new ConflictException(
          'A no-show requires an elapsed confirmed appointment without a recorded arrival',
        );
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
          proposalVersion: current.proposalVersion,
          proposedStartsAt: current.startsAt,
          proposedTimeZone: current.timeZone,
          proposalInitiator: current.proposalInitiator,
          slotId: current.slotId,
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
        title:
          dto.status === 'NO_SHOW'
            ? 'Appointment marked no-show'
            : `Appointment ${dto.status.toLowerCase()}`,
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
      appointment.requestHoldId !== (dto.holdId ?? null) ||
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
      !['CLINIC', 'HOSPITAL'].includes(access.type) ||
      !['OWNER', 'ADMIN', 'STAFF'].includes(access.role)
    )
      throw new ForbiddenException(
        'Verified clinic owner, admin, or staff access is required',
      );
  }
}
