import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../platform/persistence/prisma.service';
import {
  OUTBOX_WRITER,
  type OutboxWriter,
} from '../../platform/events/outbox-writer.port';
import { AuditService } from '../audit/audit.service';
import type { CreatePetDto, OwnerProfileDto, UpdatePetDto } from './owners.dto';
import type { OwnersPublicApi } from './owners.public';

const ownerSelect = {
  id: true,
  displayName: true,
  countryCode: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
} as const;
const petSelect = {
  id: true,
  name: true,
  speciesCode: true,
  breed: true,
  sex: true,
  birthDate: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class OwnersService implements OwnersPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
  ) {}

  getMine(accountId: string) {
    return this.prisma.ownerProfile.findUnique({
      where: { accountId },
      select: ownerSelect,
    });
  }

  async saveProfile(
    accountId: string,
    dto: OwnerProfileDto,
    correlationId: string,
  ) {
    const data = {
      displayName: dto.displayName.trim(),
      countryCode: dto.countryCode.toUpperCase(),
      phone: dto.phone.trim(),
    };
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.ownerProfile.upsert({
        where: { accountId },
        create: { accountId, ...data },
        update: data,
        select: ownerSelect,
      });
      await this.audit.recordInTransaction(tx, {
        actorId: accountId,
        action: 'owner.profile.saved',
        resourceType: 'owner_profile',
        resourceId: owner.id,
        occurredAt: new Date().toISOString(),
        correlationId,
      });
      return owner;
    });
  }

  async listPets(accountId: string) {
    const owner = await this.requireOwner(accountId);
    return this.prisma.pet.findMany({
      where: { ownerProfileId: owner.id, archivedAt: null },
      select: petSelect,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createPet(accountId: string, dto: CreatePetDto, correlationId: string) {
    const owner = await this.requireOwner(accountId);
    const birthDate = this.birthDate(dto.birthDate);
    return this.prisma.$transaction(async (tx) => {
      const pet = await tx.pet.create({
        data: {
          ownerProfileId: owner.id,
          name: dto.name.trim(),
          speciesCode: dto.speciesCode,
          breed: dto.breed?.trim() || null,
          sex: dto.sex,
          birthDate,
        },
        select: petSelect,
      });
      await this.audit.recordInTransaction(tx, {
        actorId: accountId,
        action: 'owner.pet.created',
        resourceType: 'pet',
        resourceId: pet.id,
        occurredAt: new Date().toISOString(),
        correlationId,
      });
      await this.outbox.enqueue(tx, [
        {
          id: randomUUID(),
          name: 'PetRegistered',
          version: 1,
          aggregateId: pet.id,
          occurredAt: new Date().toISOString(),
          correlationId,
          payload: { petId: pet.id, ownerProfileId: owner.id },
        },
      ]);
      return pet;
    });
  }

  async updatePet(
    accountId: string,
    petId: string,
    dto: UpdatePetDto,
    correlationId: string,
  ) {
    const owner = await this.requireOwner(accountId);
    const birthDate = dto.birthDate ? this.birthDate(dto.birthDate) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.pet.updateMany({
        where: { id: petId, ownerProfileId: owner.id, archivedAt: null },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.speciesCode ? { speciesCode: dto.speciesCode } : {}),
          ...(dto.sex ? { sex: dto.sex } : {}),
          ...(dto.breed !== undefined
            ? { breed: dto.breed?.trim() || null }
            : {}),
          ...(dto.birthDate !== undefined
            ? { birthDate: birthDate ?? null }
            : {}),
        },
      });
      if (updated.count !== 1) throw new NotFoundException('Pet not found');
      await this.audit.recordInTransaction(tx, {
        actorId: accountId,
        action: 'owner.pet.updated',
        resourceType: 'pet',
        resourceId: petId,
        occurredAt: new Date().toISOString(),
        correlationId,
      });
      return tx.pet.findUniqueOrThrow({
        where: { id: petId },
        select: petSelect,
      });
    });
  }

  async archivePet(accountId: string, petId: string, correlationId: string) {
    const owner = await this.requireOwner(accountId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.pet.updateMany({
        where: { id: petId, ownerProfileId: owner.id, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      if (updated.count !== 1) throw new NotFoundException('Pet not found');
      await this.audit.recordInTransaction(tx, {
        actorId: accountId,
        action: 'owner.pet.archived',
        resourceType: 'pet',
        resourceId: petId,
        occurredAt: new Date().toISOString(),
        correlationId,
      });
      return { archived: true };
    });
  }

  async findPetForBooking(accountId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, archivedAt: null, owner: { accountId } },
      select: {
        id: true,
        name: true,
        speciesCode: true,
        ownerProfileId: true,
        owner: { select: { displayName: true, phone: true } },
      },
    });
    return pet
      ? {
          id: pet.id,
          name: pet.name,
          speciesCode: pet.speciesCode,
          ownerProfileId: pet.ownerProfileId,
          ownerName: pet.owner.displayName,
          contactPhone: pet.owner.phone,
        }
      : null;
  }

  private async requireOwner(accountId: string) {
    const owner = await this.getMine(accountId);
    if (!owner)
      throw new NotFoundException('Create your pet-owner profile first');
    return owner;
  }

  private birthDate(value?: string) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value ||
      date > new Date()
    )
      throw new BadRequestException(
        'Pet birth date must be a valid date in the past or today',
      );
    return date;
  }
}
