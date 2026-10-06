import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../platform/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ORGANIZATIONS_PUBLIC_API,
  type OrganizationsPublicApi,
} from '../organizations/organizations.public';
import {
  OWNERS_PUBLIC_API,
  type OwnersPublicApi,
} from '../owners/owners.public';
import type {
  AvailabilityQueryDto,
  CreateAppointmentSlotDto,
  CreateBookingHoldDto,
  CreateClinicServiceDto,
  CreateClinicResourceDto,
  UpdateAppointmentSlotDto,
  UpdateClinicServiceDto,
  UpdateClinicResourceDto,
} from './scheduling.dto';

const serviceSelect = {
  id: true,
  name: true,
  description: true,
  durationMinutes: true,
  active: true,
  version: true,
} as const;
const slotSelect = {
  id: true,
  serviceId: true,
  startsAt: true,
  endsAt: true,
  timeZone: true,
  capacity: true,
  published: true,
  version: true,
} as const;
const managedSlotSelect = {
  ...slotSelect,
  resourcesReserved: true,
  resources: { select: { resourceId: true } },
} as const;
const resourceSelect = {
  id: true,
  name: true,
  kind: true,
  active: true,
  version: true,
} as const;

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ORGANIZATIONS_PUBLIC_API)
    private readonly organizations: OrganizationsPublicApi,
    @Inject(OWNERS_PUBLIC_API) private readonly owners: OwnersPublicApi,
  ) {}

  async list(
    organizationId: string,
    query: AvailabilityQueryDto,
    accountId?: string,
    existingVisit = false,
  ) {
    let enabled: boolean;
    if (accountId) {
      const grant = await this.organizations.findAccess(
        accountId,
        organizationId,
      );
      if (
        !grant ||
        grant.status !== 'VERIFIED' ||
        !['CLINIC', 'HOSPITAL'].includes(grant.type) ||
        !['OWNER', 'ADMIN', 'STAFF'].includes(grant.role)
      )
        throw new ForbiddenException(
          'Verified clinic staff access is required',
        );
      enabled = grant.appointmentSchedulingEnabled;
    } else {
      const clinic = existingVisit
        ? await this.prisma.$transaction((tx) =>
            this.organizations.lockBookableClinic(tx, organizationId, false),
          )
        : await this.organizations.findBookableClinic(organizationId);
      if (!clinic)
        throw new NotFoundException('Clinic is not accepting requests');
      enabled = clinic.appointmentSchedulingEnabled;
    }
    const now = new Date();
    const services = await this.prisma.clinicService.findMany({
      where: { organizationId, ...(!accountId ? { active: true } : {}) },
      select: serviceSelect,
      orderBy: { name: 'asc' },
      take: 100,
    });
    const slots = await this.prisma.appointmentSlot.findMany({
      where: {
        startsAt: { gt: now, lte: new Date(now.getTime() + 90 * 86400000) },
        service: { organizationId, ...(!accountId ? { active: true } : {}) },
        ...(query.serviceId ? { serviceId: query.serviceId } : {}),
        ...(!accountId ? { published: true } : {}),
      },
      select: accountId ? managedSlotSelect : slotSelect,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: 201,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    // One grouped query per page, rather than a query for every slot. No owner details are public.
    const ids = slots.slice(0, 200).map((slot) => slot.id);
    const usage = ids.length
      ? await this.prisma.$queryRaw<Array<{ id: string; occupied: bigint }>>`
      SELECT s.id, (SELECT count(*) FROM appointments.appointments a WHERE a.slot_id=s.id AND a.status IN ('REQUESTED','CONFIRMED'))
        + (SELECT count(*) FROM appointments.booking_holds h WHERE h.slot_id=s.id AND h.consumed_at IS NULL AND h.released_at IS NULL AND h.expires_at > ${now}) AS occupied
      FROM appointments.appointment_slots s WHERE s.id = ANY(${ids}::uuid[])`
      : [];
    const used = new Map(usage.map((item) => [item.id, Number(item.occupied)]));
    return {
      enabled,
      services,
      ...(accountId
        ? {
            resources: await this.prisma.clinicResource.findMany({
              where: { organizationId },
              select: resourceSelect,
              orderBy: [{ name: 'asc' }, { id: 'asc' }],
              take: 50,
            }),
          }
        : {}),
      slots: slots.slice(0, 200).map((slot) => ({
        ...slot,
        remaining: Math.max(0, slot.capacity - (used.get(slot.id) ?? 0)),
      })),
      nextCursor: slots.length > 200 ? slots[199].id : null,
    };
  }

  async createResource(
    accountId: string,
    organizationId: string,
    dto: CreateClinicResourceDto,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.organizations.lockAppointmentAccess(
        tx,
        accountId,
        organizationId,
        true,
      );
      const existing = await tx.clinicResource.findUnique({
        where: { id: dto.id },
      });
      if (existing) {
        if (
          existing.organizationId !== organizationId ||
          existing.name !== dto.name ||
          existing.kind !== dto.kind
        )
          throw new ConflictException(
            'This resource request ID has already been used',
          );
        return tx.clinicResource.findUniqueOrThrow({
          where: { id: dto.id },
          select: resourceSelect,
        });
      }
      if ((await tx.clinicResource.count({ where: { organizationId } })) >= 50)
        throw new ConflictException('This clinic already has 50 resources');
      if (
        await tx.clinicResource.findFirst({
          where: {
            organizationId,
            name: { equals: dto.name, mode: 'insensitive' },
          },
        })
      )
        throw new ConflictException(
          'This clinic already has a resource with this name. Choose a distinct name.',
        );
      const resource = await tx.clinicResource.create({
        data: { ...dto, organizationId },
        select: resourceSelect,
      });
      await this.record(
        tx,
        accountId,
        'clinic_resource.created',
        resource.id,
        correlationId,
        { organizationId, kind: resource.kind, active: resource.active },
      );
      return resource;
    });
  }

  async updateResource(
    accountId: string,
    organizationId: string,
    id: string,
    dto: UpdateClinicResourceDto,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.organizations.lockAppointmentAccess(
        tx,
        accountId,
        organizationId,
        true,
      );
      const resource = await tx.clinicResource.findFirst({
        where: { id, organizationId },
      });
      if (!resource || resource.version !== dto.version)
        throw new ConflictException('Resource changed. Refresh before saving.');
      if (
        !dto.active &&
        (await tx.slotResource.count({
          where: {
            resourceId: id,
            slot: { resourcesReserved: true, endsAt: { gt: new Date() } },
          },
        }))
      )
        throw new ConflictException(
          'This resource is reserved by an upcoming or ongoing time. Close unused times and release their resources first.',
        );
      const saved = await tx.clinicResource.update({
        where: { id },
        data: { active: dto.active, version: { increment: 1 } },
        select: resourceSelect,
      });
      await this.record(
        tx,
        accountId,
        'clinic_resource.availability_changed',
        id,
        correlationId,
        { active: { from: resource.active, to: saved.active } },
      );
      return saved;
    });
  }

  // Management holds the organization's exclusive policy lock through commit. Hold/booking
  // commands take a shared policy lock, so they cannot race release or retirement.
  private async reserveResources(
    tx: Prisma.TransactionClient,
    organizationId: string,
    resourceIds: string[],
    startsAt: Date,
    endsAt: Date,
    excludeSlotId?: string,
  ) {
    if (!resourceIds.length) return;
    const resources = await tx.clinicResource.findMany({
      where: { id: { in: resourceIds }, organizationId, active: true },
      select: { id: true },
    });
    if (resources.length !== resourceIds.length)
      throw new ConflictException(
        'Select active resources belonging to this clinic.',
      );
    if (
      await tx.slotResource.findFirst({
        where: {
          resourceId: { in: resourceIds },
          slot: {
            id: excludeSlotId ? { not: excludeSlotId } : undefined,
            resourcesReserved: true,
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        },
      })
    )
      throw new ConflictException(
        'A selected resource is already reserved at this time. Choose another time or resource.',
      );
  }

  async createService(
    accountId: string,
    organizationId: string,
    dto: CreateClinicServiceDto,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.organizations.lockAppointmentAccess(
        tx,
        accountId,
        organizationId,
        true,
      );
      const existing = await tx.clinicService.findUnique({
        where: { id: dto.id },
      });
      if (existing) {
        if (
          existing.organizationId !== organizationId ||
          existing.name !== dto.name ||
          existing.description !== dto.description ||
          existing.durationMinutes !== dto.durationMinutes
        )
          throw new ConflictException(
            'This service request ID has already been used',
          );
        return tx.clinicService.findUniqueOrThrow({
          where: { id: dto.id },
          select: serviceSelect,
        });
      }
      if ((await tx.clinicService.count({ where: { organizationId } })) >= 100)
        throw new ConflictException('This clinic already has 100 services');
      const service = await tx.clinicService.create({
        data: { ...dto, organizationId },
        select: serviceSelect,
      });
      await this.record(
        tx,
        accountId,
        'clinic_service.created',
        service.id,
        correlationId,
      );
      return service;
    });
  }

  async updateService(
    accountId: string,
    organizationId: string,
    id: string,
    dto: UpdateClinicServiceDto,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.organizations.lockAppointmentAccess(
        tx,
        accountId,
        organizationId,
        true,
      );
      const service = await tx.clinicService.findFirst({
        where: { id, organizationId },
      });
      if (!service || service.version !== dto.version)
        throw new ConflictException('Service changed. Refresh before saving.');
      if (
        dto.durationMinutes !== undefined &&
        dto.durationMinutes !== service.durationMinutes &&
        (await tx.appointmentSlot.count({ where: { serviceId: id } }))
      )
        throw new ConflictException(
          'This service already has times. Create a new service to change its duration.',
        );
      const updated = await tx.clinicService.updateMany({
        where: { id, organizationId, version: dto.version },
        data: {
          active: dto.active,
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.durationMinutes !== undefined
            ? { durationMinutes: dto.durationMinutes }
            : {}),
          version: { increment: 1 },
        },
      });
      if (!updated.count)
        throw new ConflictException('Service changed. Refresh before saving.');
      await this.record(
        tx,
        accountId,
        'clinic_service.publication_changed',
        id,
        correlationId,
      );
      return tx.clinicService.findUniqueOrThrow({
        where: { id },
        select: serviceSelect,
      });
    });
  }

  async createSlot(
    accountId: string,
    organizationId: string,
    dto: CreateAppointmentSlotDto,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.organizations.lockAppointmentAccess(
        tx,
        accountId,
        organizationId,
        true,
      );
      const service = await tx.clinicService.findFirst({
        where: { id: dto.serviceId, organizationId },
      });
      if (!service) throw new NotFoundException('Service not found');
      const startsAt = new Date(dto.startsAt);
      try {
        new Intl.DateTimeFormat('en', { timeZone: dto.timeZone }).format(
          startsAt,
        );
      } catch {
        throw new BadRequestException('Choose a valid time zone');
      }
      const existing = await tx.appointmentSlot.findUnique({
        where: { id: dto.id },
        include: { resources: { select: { resourceId: true } } },
      });
      if (existing) {
        if (
          existing.serviceId !== service.id ||
          existing.startsAt.getTime() !== startsAt.getTime() ||
          existing.timeZone !== dto.timeZone ||
          existing.capacity !== dto.capacity ||
          existing.resources
            .map((item) => item.resourceId)
            .sort()
            .join(',') !== [...(dto.resourceIds ?? [])].sort().join(',')
        )
          throw new ConflictException(
            'This time request ID has already been used',
          );
        return tx.appointmentSlot.findUniqueOrThrow({
          where: { id: dto.id },
          select: managedSlotSelect,
        });
      }
      const now = new Date();
      if (
        !Number.isFinite(startsAt.getTime()) ||
        startsAt <= now ||
        startsAt.getTime() > now.getTime() + 90 * 86400000
      )
        throw new BadRequestException(
          'Publish a future time within the next 90 days',
        );
      const endsAt = new Date(
        startsAt.getTime() + service.durationMinutes * 60000,
      );
      if (
        await tx.appointmentSlot.findFirst({
          where: {
            serviceId: service.id,
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        })
      )
        throw new ConflictException(
          'This service already has an overlapping time. Adjust its capacity instead.',
        );
      await this.reserveResources(
        tx,
        organizationId,
        dto.resourceIds ?? [],
        startsAt,
        endsAt,
      );
      const slot = await tx.appointmentSlot.create({
        data: {
          id: dto.id,
          serviceId: dto.serviceId,
          capacity: dto.capacity,
          timeZone: dto.timeZone,
          startsAt,
          endsAt,
          resources: {
            create: (dto.resourceIds ?? []).map((resourceId) => ({
              resourceId,
            })),
          },
        },
        select: managedSlotSelect,
      });
      await this.record(
        tx,
        accountId,
        'appointment_slot.created',
        slot.id,
        correlationId,
        {
          resourceIds: dto.resourceIds ?? [],
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
      );
      return slot;
    });
  }

  async updateSlot(
    accountId: string,
    organizationId: string,
    id: string,
    dto: UpdateAppointmentSlotDto,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.organizations.lockAppointmentAccess(
        tx,
        accountId,
        organizationId,
        true,
      );
      const slot = await this.lockSlot(tx, id, organizationId, false);
      if (slot.version !== dto.version)
        throw new ConflictException('Time changed. Refresh before saving.');
      if (slot.startsAt <= new Date())
        throw new ConflictException('An elapsed time cannot be changed');
      const occupied = await this.occupied(tx, id);
      if (dto.capacity < occupied)
        throw new ConflictException(
          'Capacity cannot be lower than current requests and active holds',
        );
      if (dto.releaseResources && (dto.published || occupied > 0))
        throw new ConflictException(
          'Resources can only be released from a closed time with no active appointments or holds.',
        );
      const assigned = await tx.slotResource.findMany({
        where: { slotId: id },
        select: { resourceId: true },
      });
      if (dto.published && !slot.resourcesReserved)
        await this.reserveResources(
          tx,
          organizationId,
          assigned.map((item) => item.resourceId),
          slot.startsAt,
          slot.endsAt,
          id,
        );
      const saved = await tx.appointmentSlot.update({
        where: { id },
        data: {
          capacity: dto.capacity,
          published: dto.published,
          resourcesReserved: dto.published
            ? true
            : dto.releaseResources
              ? false
              : slot.resourcesReserved,
          version: { increment: 1 },
        },
        select: managedSlotSelect,
      });
      await this.record(
        tx,
        accountId,
        'appointment_slot.updated',
        id,
        correlationId,
        {
          resourcesReserved: {
            from: slot.resourcesReserved,
            to: saved.resourcesReserved,
          },
          published: { from: slot.published, to: saved.published },
          capacity: { from: slot.capacity, to: saved.capacity },
        },
      );
      return saved;
    });
  }

  async hold(
    accountId: string,
    organizationId: string,
    dto: CreateBookingHoldDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Database-wide owner mutex; does not mutate or lock another module's identity records.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${accountId}, 20261006))`;
      const clinic = await this.organizations.lockBookableClinic(
        tx,
        organizationId,
      );
      if (!clinic || !clinic.appointmentSchedulingEnabled)
        throw new ConflictException('This clinic is not using published times');
      if (!(await this.owners.findPetForBooking(accountId, dto.petId, tx)))
        throw new NotFoundException('Pet not found');
      const slot = await this.lockSlot(tx, dto.slotId, organizationId);
      const existing = await tx.bookingHold.findUnique({
        where: { id: dto.id },
      });
      if (existing) {
        if (
          existing.accountId !== accountId ||
          existing.slotId !== dto.slotId ||
          existing.petId !== dto.petId
        )
          throw new ConflictException(
            'This hold request ID has already been used',
          );
        if (
          existing.consumedAt ||
          existing.releasedAt ||
          existing.expiresAt <= new Date()
        )
          throw new ConflictException('This hold ended. Choose a time again.');
        return {
          id: existing.id,
          expiresAt: existing.expiresAt,
          slot: {
            ...slot,
            service: {
              id: slot.service.id,
              name: slot.service.name,
              durationMinutes: slot.service.durationMinutes,
            },
          },
        };
      }
      if (
        await tx.appointment.findUnique({
          where: { requestHoldId: dto.id },
          select: { id: true },
        })
      )
        throw new ConflictException(
          'This hold was already used for an appointment',
        );
      // Choosing another time relinquishes previous temporary holds, never a submitted appointment.
      await tx.bookingHold.updateMany({
        where: { accountId, consumedAt: null, releasedAt: null },
        data: { releasedAt: new Date() },
      });
      if ((await this.occupied(tx, slot.id)) >= slot.capacity)
        throw new ConflictException(
          'This time was just taken. Refresh available times and choose another.',
        );
      const expiresAt = new Date(
        Math.min(Date.now() + 300000, slot.startsAt.getTime()),
      );
      await tx.bookingHold.create({ data: { ...dto, accountId, expiresAt } });
      return {
        id: dto.id,
        expiresAt,
        slot: {
          ...slot,
          service: {
            id: slot.service.id,
            name: slot.service.name,
            durationMinutes: slot.service.durationMinutes,
          },
        },
      };
    });
  }

  async release(accountId: string, id: string) {
    // Slot mutex coordinates cancellation with hold consumption and capacity queries.
    return this.prisma.$transaction(async (tx) => {
      const hold = await tx.bookingHold.findFirst({ where: { id, accountId } });
      if (!hold) throw new NotFoundException('Hold not found');
      await tx.$queryRaw`SELECT id FROM appointments.appointment_slots WHERE id = ${hold.slotId}::uuid FOR UPDATE`;
      await tx.bookingHold.updateMany({
        where: { id, accountId, consumedAt: null, releasedAt: null },
        data: { releasedAt: new Date() },
      });
      return { released: true };
    });
  }

  async alternatives(
    accountId: string,
    appointmentId: string,
    cursor?: string,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        requesterAccountId: true,
        organizationId: true,
        slot: { select: { serviceId: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.requesterAccountId !== accountId)
      return this.list(
        appointment.organizationId,
        { serviceId: appointment.slot?.serviceId, cursor },
        accountId,
      );
    return this.list(
      appointment.organizationId,
      { serviceId: appointment.slot?.serviceId, cursor },
      undefined,
      true,
    );
  }

  async pruneExpiredHolds(now = new Date()) {
    const cutoff = new Date(now.getTime() - 86400000);
    return this.prisma.$transaction(async (tx) => {
      const expired = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM appointments.booking_holds WHERE expires_at < ${cutoff} ORDER BY expires_at, id LIMIT 1000 FOR UPDATE SKIP LOCKED`;
      if (!expired.length) return 0;
      return (
        await tx.bookingHold.deleteMany({
          where: {
            id: { in: expired.map((item) => item.id) },
            expiresAt: { lt: cutoff },
          },
        })
      ).count;
    });
  }

  async consume(
    tx: Prisma.TransactionClient,
    accountId: string,
    organizationId: string,
    petId: string,
    holdId: string,
    startsAt: Date,
    timeZone: string,
  ) {
    const hold = await tx.bookingHold.findFirst({
      where: { id: holdId, accountId, petId },
    });
    if (!hold) throw new NotFoundException('Time hold not found');
    const slot = await this.lockSlot(tx, hold.slotId, organizationId);
    if (
      slot.startsAt.getTime() !== startsAt.getTime() ||
      slot.timeZone !== timeZone
    )
      throw new ConflictException(
        'The request must use the held time and time zone',
      );
    const consumed = await tx.bookingHold.updateMany({
      where: {
        id: holdId,
        accountId,
        consumedAt: null,
        releasedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (!consumed.count)
      throw new ConflictException(
        'Your time hold expired or was used. Choose a time again.',
      );
    // Existing active hold already occupies this seat; a second capacity check detects admin changes.
    if ((await this.occupied(tx, slot.id)) >= slot.capacity)
      throw new ConflictException('This time is no longer available');
    return slot;
  }

  async validateProposal(
    tx: Prisma.TransactionClient,
    organizationId: string,
    currentSlotId: string | null,
    proposedSlotId: string | undefined,
    startsAt: Date,
    timeZone: string,
  ) {
    if (!currentSlotId && !proposedSlotId) return null;
    if (
      !(await this.organizations.lockBookableClinic(tx, organizationId, false))
    )
      throw new ConflictException(
        'This clinic is no longer verified. The original appointment is unchanged.',
      );
    if (!currentSlotId || !proposedSlotId)
      throw new BadRequestException(
        'Choose a published time for this scheduled appointment',
      );
    const currentSlot = await tx.appointmentSlot.findUniqueOrThrow({
      where: { id: currentSlotId },
      select: { serviceId: true },
    });
    const proposed = await this.lockSlot(tx, proposedSlotId, organizationId);
    if (
      proposed.serviceId !== currentSlot.serviceId ||
      proposed.startsAt.getTime() !== startsAt.getTime() ||
      proposed.timeZone !== timeZone ||
      proposed.id === currentSlotId
    )
      throw new BadRequestException(
        'Choose a different published time for the same service',
      );
    if ((await this.occupied(tx, proposed.id)) >= proposed.capacity)
      throw new ConflictException(
        'The proposed time has no capacity. The original appointment is unchanged.',
      );
    return proposed.id;
  }

  private async lockSlot(
    tx: Prisma.TransactionClient,
    id: string,
    organizationId: string,
    bookable = true,
  ) {
    // Service SHARE lock also stabilizes publication while requests/reschedules commit.
    await tx.$queryRaw`SELECT s.id FROM appointments.appointment_slots s JOIN appointments.clinic_services c ON c.id=s.service_id WHERE s.id=${id}::uuid AND c.organization_id=${organizationId}::uuid FOR UPDATE OF s FOR SHARE OF c`;
    const slot = await tx.appointmentSlot.findFirst({
      where: { id, service: { organizationId } },
      include: {
        service: {
          select: { id: true, name: true, durationMinutes: true, active: true },
        },
      },
    });
    if (!slot) throw new NotFoundException('Published time not found');
    if (
      bookable &&
      (!slot.published || !slot.service.active || slot.startsAt <= new Date())
    )
      throw new ConflictException('This time is no longer available');
    return slot;
  }

  private async occupied(tx: Prisma.TransactionClient, slotId: string) {
    const [requests, holds] = await Promise.all([
      tx.appointment.count({
        where: { slotId, status: { in: ['REQUESTED', 'CONFIRMED'] } },
      }),
      tx.bookingHold.count({
        where: {
          slotId,
          consumedAt: null,
          releasedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
    return requests + holds;
  }
  private record(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    resourceId: string,
    correlationId: string,
    changes?: Record<string, unknown>,
  ) {
    return this.audit.recordInTransaction(tx, {
      actorId,
      action,
      resourceType: action.startsWith('clinic_service')
        ? 'clinic_service'
        : action.startsWith('clinic_resource')
          ? 'clinic_resource'
          : 'appointment_slot',
      resourceId,
      occurredAt: new Date().toISOString(),
      correlationId,
      changes,
    });
  }
}
