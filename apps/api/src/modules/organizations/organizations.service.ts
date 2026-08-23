import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  OrganizationMemberRole,
  OrganizationVerificationDecisionAction,
} from '../../generated/prisma/enums';
import {
  OUTBOX_WRITER,
  type OutboxWriter,
} from '../../platform/events/outbox-writer.port';
import {
  PRIVATE_FILE_STORAGE,
  type PrivateFileStorage,
} from '../../platform/files/private-file-storage.port';
import { PrismaService } from '../../platform/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateOrganizationDto,
  InviteOrganizationMemberDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import type { OrganizationsPublicApi } from './organizations.public';

const organizationSelect = {
  id: true,
  legalName: true,
  publicName: true,
  type: true,
  countryCode: true,
  email: true,
  phone: true,
  website: true,
  addressLine1: true,
  city: true,
  region: true,
  postalCode: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const verificationSelect = {
  id: true,
  organizationId: true,
  status: true,
  assignedReviewerId: true,
  submittedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  evidence: {
    select: { id: true, fileObjectId: true, kind: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
  decisions: {
    select: { id: true, action: true, reason: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class OrganizationsService implements OrganizationsPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(PRIVATE_FILE_STORAGE) private readonly storage: PrivateFileStorage,
  ) {}

  async findSummary(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, legalName: true, status: true },
    });
    if (!organization) return null;
    const mapping = {
      DRAFT: 'unverified',
      VERIFICATION_PENDING: 'pending',
      VERIFIED: 'verified',
      REJECTED: 'rejected',
      SUSPENDED: 'rejected',
      CLOSED: 'rejected',
    } as const;
    return {
      id: organization.id,
      legalName: organization.legalName,
      verificationStatus: mapping[organization.status],
    };
  }

  async findAccess(accountId: string, organizationId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_accountId: { organizationId, accountId } },
      select: { role: true, organization: { select: { status: true } } },
    });
    return membership
      ? { role: membership.role, status: membership.organization.status }
      : null;
  }

  async listMine(accountId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { accountId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        organization: { select: organizationSelect },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships;
  }

  async getMine(accountId: string, organizationId: string) {
    const membership = await this.requireMembership(accountId, organizationId);
    const [members, invitations, verification] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where: { organizationId },
        select: {
          id: true,
          role: true,
          createdAt: true,
          account: { select: { id: true, email: true, status: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.organizationInvitation.findMany({
        where: { organizationId, status: 'PENDING' },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organizationVerificationRequest.findUnique({
        where: { organizationId },
        select: verificationSelect,
      }),
    ]);
    return {
      organization: membership.organization,
      membership: { id: membership.id, role: membership.role },
      members,
      invitations,
      verification: verification
        ? await this.withFileMetadata(verification, accountId)
        : null,
    };
  }

  async createMine(
    accountId: string,
    dto: CreateOrganizationDto,
    correlationId: string,
  ) {
    const id = randomUUID();
    const verificationId = randomUUID();
    const occurredAt = new Date();
    const normalized = this.normalizedOrganizationData(dto);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.organization.create({
        data: {
          id,
          ...normalized,
          legalName: dto.legalName.trim(),
          type: dto.type,
          countryCode: dto.countryCode.toUpperCase(),
        },
      });
      await transaction.organizationMembership.create({
        data: { organizationId: id, accountId, role: 'OWNER' },
      });
      await transaction.organizationVerificationRequest.create({
        data: { id: verificationId, organizationId: id },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'organization.created',
        resourceType: 'organization',
        resourceId: id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { status: { to: 'DRAFT' }, ownerAccountId: accountId },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'OrganizationCreated',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: id,
          correlationId,
          payload: { organizationId: id, ownerAccountId: accountId },
        },
      ]);
    });
    return this.getMine(accountId, id);
  }

  async updateMine(
    accountId: string,
    organizationId: string,
    dto: UpdateOrganizationDto,
    correlationId: string,
  ) {
    const membership = await this.requireManager(accountId, organizationId);
    if (membership.organization.status === 'VERIFIED') {
      throw new ConflictException(
        'Verified organization details require a governed change request',
      );
    }
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: this.normalizedOrganizationData(dto),
      select: organizationSelect,
    });
    await this.audit.record({
      actorId: accountId,
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: organizationId,
      occurredAt: new Date().toISOString(),
      correlationId,
    });
    return updated;
  }

  async inviteMember(
    accountId: string,
    organizationId: string,
    dto: InviteOrganizationMemberDto,
    correlationId: string,
  ) {
    await this.requireManager(accountId, organizationId);
    const email = dto.email.trim().toLowerCase();
    const existingAccount = await this.prisma.account.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingAccount) {
      const membership = await this.prisma.organizationMembership.findUnique({
        where: {
          organizationId_accountId: {
            organizationId,
            accountId: existingAccount.id,
          },
        },
      });
      if (membership)
        throw new ConflictException('This account is already a member');
    }
    const pending = await this.prisma.organizationInvitation.findFirst({
      where: {
        organizationId,
        email,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (pending)
      throw new ConflictException(
        'A valid invitation already exists for this email',
      );
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId,
        email,
        role: dto.role,
        tokenHash,
        invitedBy: accountId,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    await this.audit.record({
      actorId: accountId,
      action: 'organization.member.invited',
      resourceType: 'organization',
      resourceId: organizationId,
      occurredAt: new Date().toISOString(),
      correlationId,
      changes: { invitationId: invitation.id, email, role: dto.role },
    });
    return { ...invitation, invitationToken: token };
  }

  async acceptInvitation(
    accountId: string,
    token: string,
    correlationId: string,
  ) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { email: true, status: true },
    });
    if (!account || account.status !== 'ACTIVE') throw new ForbiddenException();
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (!invitation || invitation.status !== 'PENDING') {
      throw new NotFoundException(
        'Invitation is invalid or no longer available',
      );
    }
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new ConflictException('Invitation has expired');
    }
    if (invitation.email !== account.email) {
      throw new ForbiddenException(
        'Invitation belongs to a different email address',
      );
    }
    const occurredAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.organizationMembership.upsert({
        where: {
          organizationId_accountId: {
            organizationId: invitation.organizationId,
            accountId,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          accountId,
          role: invitation.role,
        },
        update: {},
      });
      await transaction.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: occurredAt },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'organization.member.joined',
        resourceType: 'organization',
        resourceId: invitation.organizationId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { invitationId: invitation.id, role: invitation.role },
      });
    });
    return this.getMine(accountId, invitation.organizationId);
  }

  async addVerificationEvidence(
    accountId: string,
    organizationId: string,
    file: Express.Multer.File,
    correlationId: string,
  ) {
    await this.requireManager(accountId, organizationId);
    const request =
      await this.prisma.organizationVerificationRequest.findUnique({
        where: { organizationId },
        select: verificationSelect,
      });
    if (!request)
      throw new NotFoundException(
        'Organization verification request not found',
      );
    if (!['EVIDENCE_REQUIRED', 'NEEDS_INFORMATION'].includes(request.status)) {
      throw new ConflictException(
        'Evidence cannot be added in the current state',
      );
    }
    const stored = await this.storage.store(file);
    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const fileObject = await transaction.fileObject.create({
          data: {
            ownerAccountId: accountId,
            originalName: this.safeOriginalName(file.originalname),
            mediaType: stored.mediaType,
            byteSize: stored.byteSize,
            objectKey: stored.objectKey,
            checksumSha256: stored.checksumSha256,
          },
        });
        await transaction.organizationVerificationEvidence.create({
          data: {
            verificationRequestId: request.id,
            fileObjectId: fileObject.id,
          },
        });
        const next = await transaction.organizationVerificationRequest.update({
          where: { id: request.id },
          data: { status: 'READY_TO_SUBMIT' },
          select: verificationSelect,
        });
        await this.audit.recordInTransaction(transaction, {
          actorId: accountId,
          action: 'organization.verification.evidence.added',
          resourceType: 'organization_verification_request',
          resourceId: request.id,
          occurredAt: new Date().toISOString(),
          correlationId,
          changes: {
            fileObjectId: fileObject.id,
            status: { from: request.status, to: 'READY_TO_SUBMIT' },
          },
        });
        return next;
      });
      return this.withFileMetadata(updated, accountId);
    } catch (error) {
      await this.storage.remove(stored.objectKey);
      throw error;
    }
  }

  async submitVerification(
    accountId: string,
    organizationId: string,
    correlationId: string,
  ) {
    await this.requireManager(accountId, organizationId);
    const request =
      await this.prisma.organizationVerificationRequest.findUnique({
        where: { organizationId },
        select: verificationSelect,
      });
    if (!request)
      throw new NotFoundException(
        'Organization verification request not found',
      );
    if (request.status === 'SUBMITTED' || request.status === 'UNDER_REVIEW')
      return request;
    if (request.status !== 'READY_TO_SUBMIT' || request.evidence.length === 0) {
      throw new ConflictException(
        'Validated organization evidence is required',
      );
    }
    const occurredAt = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const next = await transaction.organizationVerificationRequest.update({
        where: { id: request.id },
        data: { status: 'SUBMITTED', submittedAt: occurredAt },
        select: verificationSelect,
      });
      await transaction.organization.update({
        where: { id: organizationId },
        data: { status: 'VERIFICATION_PENDING' },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'organization.verification.submitted',
        resourceType: 'organization_verification_request',
        resourceId: request.id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { status: { from: 'READY_TO_SUBMIT', to: 'SUBMITTED' } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'OrganizationVerificationSubmitted',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: organizationId,
          correlationId,
          payload: { organizationId, verificationRequestId: request.id },
        },
      ]);
      return next;
    });
    return this.withFileMetadata(updated, accountId);
  }

  async listReviewQueue() {
    return this.prisma.organizationVerificationRequest.findMany({
      where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      select: {
        ...verificationSelect,
        organization: { select: organizationSelect },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  async getReview(requestId: string) {
    const request =
      await this.prisma.organizationVerificationRequest.findUnique({
        where: { id: requestId },
        select: {
          ...verificationSelect,
          organization: { select: organizationSelect },
        },
      });
    if (!request) throw new NotFoundException('Organization review not found');
    const auditTrail = await this.prisma.auditEvent.findMany({
      where: {
        resourceType: 'organization_verification_request',
        resourceId: requestId,
      },
      select: {
        id: true,
        actorId: true,
        action: true,
        occurredAt: true,
        reason: true,
        changes: true,
      },
      orderBy: { occurredAt: 'desc' },
    });
    return { ...(await this.withFileMetadata(request)), auditTrail };
  }

  async startReview(
    reviewerAccountId: string,
    requestId: string,
    correlationId: string,
  ) {
    const existing =
      await this.prisma.organizationVerificationRequest.findUnique({
        where: { id: requestId },
        select: { status: true, assignedReviewerId: true },
      });
    if (!existing) throw new NotFoundException('Organization review not found');
    if (
      existing.status === 'UNDER_REVIEW' &&
      existing.assignedReviewerId === reviewerAccountId
    )
      return this.getReview(requestId);
    if (existing.status !== 'SUBMITTED')
      throw new ConflictException(
        'Only a submitted organization can be reviewed',
      );
    const occurredAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const claimed =
        await transaction.organizationVerificationRequest.updateMany({
          where: {
            id: requestId,
            status: 'SUBMITTED',
            assignedReviewerId: null,
          },
          data: {
            status: 'UNDER_REVIEW',
            assignedReviewerId: reviewerAccountId,
          },
        });
      if (claimed.count !== 1)
        throw new ConflictException(
          'This organization was claimed by another reviewer',
        );
      await this.audit.recordInTransaction(transaction, {
        actorId: reviewerAccountId,
        action: 'organization.verification.review.started',
        resourceType: 'organization_verification_request',
        resourceId: requestId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { status: { from: 'SUBMITTED', to: 'UNDER_REVIEW' } },
      });
    });
    return this.getReview(requestId);
  }

  async decideReview(
    reviewerAccountId: string,
    requestId: string,
    action: OrganizationVerificationDecisionAction,
    reasonInput: string | undefined,
    correlationId: string,
  ) {
    const reason = reasonInput?.trim() || undefined;
    if (action !== 'VERIFIED' && (!reason || reason.length < 10))
      throw new BadRequestException('A specific decision reason is required');
    const occurredAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const request =
        await transaction.organizationVerificationRequest.findUnique({
          where: { id: requestId },
          select: {
            status: true,
            assignedReviewerId: true,
            organizationId: true,
          },
        });
      if (!request)
        throw new NotFoundException('Organization review not found');
      if (
        request.status !== 'UNDER_REVIEW' ||
        request.assignedReviewerId !== reviewerAccountId
      ) {
        throw new ConflictException(
          'The review must be started by this reviewer before deciding it',
        );
      }
      await transaction.organizationVerificationDecision.create({
        data: {
          verificationRequestId: requestId,
          reviewerAccountId,
          action,
          reason,
        },
      });
      await transaction.organizationVerificationRequest.update({
        where: { id: requestId },
        data: {
          status: action,
          reviewedAt: occurredAt,
          assignedReviewerId:
            action === 'NEEDS_INFORMATION' ? null : reviewerAccountId,
        },
      });
      const organizationStatus =
        action === 'VERIFIED'
          ? 'VERIFIED'
          : action === 'REJECTED'
            ? 'REJECTED'
            : 'VERIFICATION_PENDING';
      await transaction.organization.update({
        where: { id: request.organizationId },
        data: { status: organizationStatus },
      });
      const owners = await transaction.organizationMembership.findMany({
        where: {
          organizationId: request.organizationId,
          role: { in: ['OWNER', 'ADMIN'] },
        },
        select: { accountId: true },
      });
      const copy =
        action === 'VERIFIED'
          ? {
              kind: 'ORGANIZATION_VERIFIED' as const,
              title: 'Organization verified',
              message: 'VetLinX approved your organization evidence.',
            }
          : action === 'REJECTED'
            ? {
                kind: 'ORGANIZATION_REJECTED' as const,
                title: 'Organization review declined',
                message: reason!,
              }
            : {
                kind: 'ORGANIZATION_INFORMATION_REQUESTED' as const,
                title: 'More organization evidence requested',
                message: reason!,
              };
      await transaction.notification.createMany({
        data: owners.map(({ accountId }) => ({
          recipientAccountId: accountId,
          ...copy,
          resourceType: 'organization',
          resourceId: request.organizationId,
        })),
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: reviewerAccountId,
        action: `organization.verification.review.${action.toLowerCase()}`,
        resourceType: 'organization_verification_request',
        resourceId: requestId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        reason,
        changes: {
          status: { from: 'UNDER_REVIEW', to: action },
          organizationStatus,
        },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name:
            action === 'VERIFIED'
              ? 'OrganizationVerified'
              : action === 'REJECTED'
                ? 'OrganizationRejected'
                : 'OrganizationInformationRequested',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: request.organizationId,
          correlationId,
          payload: {
            organizationId: request.organizationId,
            verificationRequestId: requestId,
            action,
          },
        },
      ]);
    });
    return this.getReview(requestId);
  }

  async readReviewEvidence(requestId: string, evidenceId: string) {
    const evidence =
      await this.prisma.organizationVerificationEvidence.findFirst({
        where: { id: evidenceId, verificationRequestId: requestId },
        select: { fileObjectId: true },
      });
    if (!evidence) throw new NotFoundException('Evidence file not found');
    const file = await this.prisma.fileObject.findUnique({
      where: { id: evidence.fileObjectId },
      select: {
        originalName: true,
        mediaType: true,
        objectKey: true,
        validationStatus: true,
      },
    });
    if (!file || file.validationStatus !== 'VALIDATED')
      throw new NotFoundException('Evidence file not available');
    try {
      return {
        buffer: await this.storage.read(file.objectKey),
        mediaType: file.mediaType,
        downloadName: file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_'),
      };
    } catch {
      throw new NotFoundException('Evidence file not available');
    }
  }

  private async requireMembership(accountId: string, organizationId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_accountId: { organizationId, accountId } },
      select: {
        id: true,
        role: true,
        organization: { select: organizationSelect },
      },
    });
    if (!membership) throw new NotFoundException('Organization not found');
    return membership;
  }

  private async requireManager(accountId: string, organizationId: string) {
    const membership = await this.requireMembership(accountId, organizationId);
    if (
      !(['OWNER', 'ADMIN'] as OrganizationMemberRole[]).includes(
        membership.role,
      )
    ) {
      throw new ForbiddenException(
        'Organization owner or admin access is required',
      );
    }
    return membership;
  }

  private normalizedOrganizationData(dto: UpdateOrganizationDto) {
    const clean = (value?: string) => value?.trim() || undefined;
    return {
      ...(dto.legalName !== undefined
        ? { legalName: dto.legalName.trim() }
        : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.countryCode !== undefined
        ? { countryCode: dto.countryCode.toUpperCase() }
        : {}),
      ...(dto.publicName !== undefined
        ? { publicName: clean(dto.publicName) }
        : {}),
      ...(dto.email !== undefined
        ? { email: dto.email.trim().toLowerCase() }
        : {}),
      ...(dto.phone !== undefined ? { phone: clean(dto.phone) } : {}),
      ...(dto.website !== undefined ? { website: clean(dto.website) } : {}),
      ...(dto.addressLine1 !== undefined
        ? { addressLine1: clean(dto.addressLine1) }
        : {}),
      ...(dto.city !== undefined ? { city: clean(dto.city) } : {}),
      ...(dto.region !== undefined ? { region: clean(dto.region) } : {}),
      ...(dto.postalCode !== undefined
        ? { postalCode: clean(dto.postalCode) }
        : {}),
    };
  }

  private async withFileMetadata<
    T extends { evidence: Array<{ fileObjectId: string }> },
  >(request: T, ownerAccountId?: string) {
    const fileIds = request.evidence.map((item) => item.fileObjectId);
    const files = await this.prisma.fileObject.findMany({
      where: {
        id: { in: fileIds },
        ...(ownerAccountId ? { ownerAccountId } : {}),
      },
      select: {
        id: true,
        originalName: true,
        mediaType: true,
        byteSize: true,
        validationStatus: true,
      },
    });
    const byId = new Map(files.map((file) => [file.id, file]));
    return {
      ...request,
      evidence: request.evidence.map((item) => ({
        ...item,
        file: byId.get(item.fileObjectId) ?? null,
      })),
    };
  }

  private safeOriginalName(value: string) {
    const normalized = value
      .normalize('NFKC')
      .replace(/[\\/\0\r\n]/g, '_')
      .trim();
    if (!normalized)
      throw new BadRequestException('Evidence filename is invalid');
    return normalized.slice(0, 255);
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
