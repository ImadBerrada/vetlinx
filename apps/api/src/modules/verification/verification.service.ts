import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { VerificationDecisionAction } from '../../generated/prisma/enums';
import { randomUUID } from 'node:crypto';
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
import {
  PRIVATE_FILE_STORAGE,
  type PrivateFileStorage,
} from '../../platform/files/private-file-storage.port';

const requestSelect = {
  id: true,
  credentialId: true,
  professionalProfileId: true,
  status: true,
  submittedAt: true,
  assignedReviewerId: true,
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
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(CREDENTIALS_PUBLIC_API)
    private readonly credentials: CredentialsPublicApi,
    @Inject(PROFESSIONALS_PUBLIC_API)
    private readonly professionals: ProfessionalsPublicApi,
    @Inject(PRIVATE_FILE_STORAGE) private readonly storage: PrivateFileStorage,
  ) {}

  async listMine(accountId: string) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional)
      throw new NotFoundException('Professional profile not found');
    const requests = await this.prisma.verificationRequest.findMany({
      where: { professionalProfileId: professional.id },
      select: requestSelect,
      orderBy: { createdAt: 'desc' },
    });
    return this.withFileMetadata(requests, accountId);
  }

  async createMine(
    accountId: string,
    credentialId: string,
    correlationId: string,
  ) {
    const credential = await this.credentials.findOwnedByAccount(
      accountId,
      credentialId,
    );
    if (!credential) throw new NotFoundException('Credential not found');
    if (credential.status !== 'SUBMITTED') {
      throw new ConflictException(
        'Submit credential details before collecting evidence',
      );
    }
    const existing = await this.prisma.verificationRequest.findUnique({
      where: { credentialId },
      select: requestSelect,
    });
    if (existing)
      return (await this.withFileMetadata([existing], accountId))[0];

    const id = randomUUID();
    const occurredAt = new Date();
    const created = await this.prisma.$transaction(async (transaction) => {
      const request = await transaction.verificationRequest.create({
        data: {
          id,
          credentialId,
          professionalProfileId: credential.professionalProfileId,
        },
        select: requestSelect,
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'verification.request.created',
        resourceType: 'verification_request',
        resourceId: id,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { status: { to: 'EVIDENCE_REQUIRED' }, credentialId },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'VerificationRequestCreated',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: id,
          correlationId,
          payload: {
            verificationRequestId: id,
            credentialId,
            professionalProfileId: credential.professionalProfileId,
          },
        },
      ]);
      return request;
    });
    return (await this.withFileMetadata([created], accountId))[0];
  }

  async addEvidence(
    accountId: string,
    requestId: string,
    file: Express.Multer.File,
    correlationId: string,
  ) {
    const request = await this.requireOwnedRequest(accountId, requestId);
    if (!['EVIDENCE_REQUIRED', 'NEEDS_INFORMATION'].includes(request.status)) {
      throw new ConflictException(
        'Evidence cannot be added in the current verification state',
      );
    }
    const safeName = this.safeOriginalName(file.originalname);
    const stored = await this.storage.store(file);
    const fileObjectId = randomUUID();
    const evidenceId = randomUUID();
    const occurredAt = new Date();
    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        await transaction.fileObject.create({
          data: {
            id: fileObjectId,
            ownerAccountId: accountId,
            originalName: safeName,
            mediaType: stored.mediaType,
            byteSize: stored.byteSize,
            objectKey: stored.objectKey,
            checksumSha256: stored.checksumSha256,
          },
        });
        await transaction.verificationEvidence.create({
          data: {
            id: evidenceId,
            verificationRequestId: requestId,
            fileObjectId,
          },
        });
        const next = await transaction.verificationRequest.update({
          where: { id: requestId },
          data: { status: 'READY_TO_SUBMIT' },
          select: requestSelect,
        });
        await this.audit.recordInTransaction(transaction, {
          actorId: accountId,
          action: 'verification.evidence.added',
          resourceType: 'verification_request',
          resourceId: requestId,
          occurredAt: occurredAt.toISOString(),
          correlationId,
          changes: {
            evidenceId,
            mediaType: stored.mediaType,
            byteSize: stored.byteSize,
            status: { from: request.status, to: 'READY_TO_SUBMIT' },
          },
        });
        await this.outbox.enqueue(transaction, [
          {
            id: randomUUID(),
            name: 'VerificationEvidenceAdded',
            version: 1,
            occurredAt: occurredAt.toISOString(),
            aggregateId: requestId,
            correlationId,
            payload: {
              verificationRequestId: requestId,
              evidenceId,
              fileObjectId,
            },
          },
        ]);
        return next;
      });
      return (await this.withFileMetadata([updated], accountId))[0];
    } catch (error) {
      await this.storage.remove(stored.objectKey);
      throw error;
    }
  }

  async submitMine(
    accountId: string,
    requestId: string,
    correlationId: string,
  ) {
    const request = await this.requireOwnedRequest(accountId, requestId);
    if (request.status === 'SUBMITTED' || request.status === 'UNDER_REVIEW')
      return request;
    if (request.status !== 'READY_TO_SUBMIT' || request.evidence.length === 0) {
      throw new ConflictException(
        'At least one validated evidence file is required',
      );
    }
    const occurredAt = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const next = await transaction.verificationRequest.update({
        where: { id: requestId },
        data: { status: 'SUBMITTED', submittedAt: occurredAt },
        select: requestSelect,
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: accountId,
        action: 'verification.request.submitted',
        resourceType: 'verification_request',
        resourceId: requestId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: { status: { from: 'READY_TO_SUBMIT', to: 'SUBMITTED' } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'VerificationRequestSubmitted',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: requestId,
          correlationId,
          payload: {
            verificationRequestId: requestId,
            credentialId: request.credentialId,
          },
        },
      ]);
      return next;
    });
    return (await this.withFileMetadata([updated], accountId))[0];
  }

  async listReviewQueue() {
    const requests = await this.prisma.verificationRequest.findMany({
      where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      select: requestSelect,
      orderBy: [{ status: 'asc' }, { submittedAt: 'asc' }],
    });
    const profileIds = [
      ...new Set(requests.map((item) => item.professionalProfileId)),
    ];
    const credentialIds = [
      ...new Set(requests.map((item) => item.credentialId)),
    ];
    const [profiles, credentials] = await Promise.all([
      this.prisma.professionalProfile.findMany({
        where: { id: { in: profileIds } },
        select: {
          id: true,
          displayName: true,
          countryCode: true,
          account: { select: { email: true } },
        },
      }),
      this.prisma.credential.findMany({
        where: { id: { in: credentialIds } },
        select: {
          id: true,
          typeCode: true,
          title: true,
          issuingOrganization: true,
          countryCode: true,
          status: true,
          expiryDate: true,
        },
      }),
    ]);
    const profilesById = new Map(profiles.map((item) => [item.id, item]));
    const credentialsById = new Map(credentials.map((item) => [item.id, item]));
    return requests.map((item) => ({
      id: item.id,
      status: item.status,
      submittedAt: item.submittedAt,
      updatedAt: item.updatedAt,
      assignedReviewerId: item.assignedReviewerId,
      evidenceCount: item.evidence.length,
      professional: profilesById.get(item.professionalProfileId) ?? null,
      credential: credentialsById.get(item.credentialId) ?? null,
    }));
  }

  async getReview(requestId: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      select: requestSelect,
    });
    if (!request) throw new NotFoundException('Verification request not found');
    const fileIds = request.evidence.map((item) => item.fileObjectId);
    const [professional, credential, files, auditTrail] = await Promise.all([
      this.prisma.professionalProfile.findUnique({
        where: { id: request.professionalProfileId },
        select: {
          id: true,
          displayName: true,
          countryCode: true,
          status: true,
          account: { select: { email: true } },
        },
      }),
      this.prisma.credential.findUnique({
        where: { id: request.credentialId },
        select: {
          id: true,
          typeCode: true,
          title: true,
          issuingOrganization: true,
          countryCode: true,
          issueDate: true,
          expiryDate: true,
          status: true,
          submittedAt: true,
        },
      }),
      this.prisma.fileObject.findMany({
        where: { id: { in: fileIds } },
        select: {
          id: true,
          originalName: true,
          mediaType: true,
          byteSize: true,
          validationStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.auditEvent.findMany({
        where: { resourceType: 'verification_request', resourceId: requestId },
        select: {
          id: true,
          actorId: true,
          action: true,
          occurredAt: true,
          reason: true,
          changes: true,
        },
        orderBy: { occurredAt: 'desc' },
      }),
    ]);
    const filesById = new Map(files.map((item) => [item.id, item]));
    return {
      ...request,
      professional,
      credential,
      evidence: request.evidence.map((item) => ({
        ...item,
        file: filesById.get(item.fileObjectId) ?? null,
      })),
      auditTrail,
    };
  }

  async startReview(
    reviewerAccountId: string,
    requestId: string,
    correlationId: string,
  ) {
    const existing = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      select: { status: true, assignedReviewerId: true },
    });
    if (!existing)
      throw new NotFoundException('Verification request not found');
    if (
      existing.status === 'UNDER_REVIEW' &&
      existing.assignedReviewerId === reviewerAccountId
    ) {
      return this.getReview(requestId);
    }
    if (existing.status !== 'SUBMITTED') {
      throw new ConflictException('Only a submitted request can be started');
    }

    const occurredAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.verificationRequest.updateMany({
        where: { id: requestId, status: 'SUBMITTED', assignedReviewerId: null },
        data: { status: 'UNDER_REVIEW', assignedReviewerId: reviewerAccountId },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'This request was claimed by another reviewer',
        );
      }
      await this.audit.recordInTransaction(transaction, {
        actorId: reviewerAccountId,
        action: 'verification.review.started',
        resourceType: 'verification_request',
        resourceId: requestId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        changes: {
          status: { from: 'SUBMITTED', to: 'UNDER_REVIEW' },
          assignedReviewerId: { to: reviewerAccountId },
        },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name: 'VerificationReviewStarted',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: requestId,
          correlationId,
          payload: { verificationRequestId: requestId, reviewerAccountId },
        },
      ]);
    });
    return this.getReview(requestId);
  }

  async decideReview(
    reviewerAccountId: string,
    requestId: string,
    action: VerificationDecisionAction,
    reasonInput: string | undefined,
    correlationId: string,
  ) {
    const reason = reasonInput?.trim() || undefined;
    if (action !== 'VERIFIED' && (!reason || reason.length < 10)) {
      throw new BadRequestException('A specific decision reason is required');
    }
    const occurredAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.verificationRequest.findUnique({
        where: { id: requestId },
        select: {
          status: true,
          assignedReviewerId: true,
          credentialId: true,
          professionalProfileId: true,
        },
      });
      if (!current)
        throw new NotFoundException('Verification request not found');
      if (
        current.status !== 'UNDER_REVIEW' ||
        current.assignedReviewerId !== reviewerAccountId
      ) {
        throw new ConflictException(
          'The review must be started by this reviewer before deciding it',
        );
      }

      await transaction.verificationDecision.create({
        data: {
          verificationRequestId: requestId,
          reviewerAccountId,
          action,
          reason,
        },
      });
      await transaction.verificationRequest.update({
        where: { id: requestId },
        data: {
          status: action,
          reviewedAt: occurredAt,
          assignedReviewerId:
            action === 'NEEDS_INFORMATION' ? null : reviewerAccountId,
        },
      });
      if (action === 'VERIFIED' || action === 'REJECTED') {
        await transaction.credential.update({
          where: { id: current.credentialId },
          data: { status: action },
        });
        await this.audit.recordInTransaction(transaction, {
          actorId: reviewerAccountId,
          action: `credential.${action.toLowerCase()}`,
          resourceType: 'credential',
          resourceId: current.credentialId,
          occurredAt: occurredAt.toISOString(),
          correlationId,
          reason,
          changes: { status: { from: 'SUBMITTED', to: action } },
        });
      }
      const recipient = await transaction.professionalProfile.findUniqueOrThrow(
        {
          where: { id: current.professionalProfileId },
          select: { accountId: true },
        },
      );
      const notificationCopy =
        action === 'VERIFIED'
          ? {
              kind: 'CREDENTIAL_VERIFIED' as const,
              title: 'Credential verified',
              message:
                'An authorized VetLinX reviewer approved your credential evidence.',
            }
          : action === 'REJECTED'
            ? {
                kind: 'CREDENTIAL_REJECTED' as const,
                title: 'Credential review declined',
                message: reason!,
              }
            : {
                kind: 'VERIFICATION_INFORMATION_REQUESTED' as const,
                title: 'More evidence requested',
                message: reason!,
              };
      await transaction.notification.create({
        data: {
          recipientAccountId: recipient.accountId,
          ...notificationCopy,
          resourceType: 'verification_request',
          resourceId: requestId,
        },
      });
      await this.audit.recordInTransaction(transaction, {
        actorId: reviewerAccountId,
        action: `verification.review.${action.toLowerCase()}`,
        resourceType: 'verification_request',
        resourceId: requestId,
        occurredAt: occurredAt.toISOString(),
        correlationId,
        reason,
        changes: { status: { from: 'UNDER_REVIEW', to: action } },
      });
      await this.outbox.enqueue(transaction, [
        {
          id: randomUUID(),
          name:
            action === 'VERIFIED'
              ? 'CredentialVerified'
              : action === 'REJECTED'
                ? 'CredentialRejected'
                : 'VerificationInformationRequested',
          version: 1,
          occurredAt: occurredAt.toISOString(),
          aggregateId: requestId,
          correlationId,
          payload: {
            verificationRequestId: requestId,
            credentialId: current.credentialId,
            professionalProfileId: current.professionalProfileId,
            reviewerAccountId,
            action,
          },
        },
      ]);
    });
    return this.getReview(requestId);
  }

  async readReviewEvidence(requestId: string, evidenceId: string) {
    const evidence = await this.prisma.verificationEvidence.findFirst({
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
    if (!file || file.validationStatus !== 'VALIDATED') {
      throw new NotFoundException('Evidence file not available');
    }
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

  private async requireOwnedRequest(accountId: string, requestId: string) {
    const professional = await this.professionals.findByAccountId(accountId);
    if (!professional)
      throw new NotFoundException('Professional profile not found');
    const request = await this.prisma.verificationRequest.findFirst({
      where: { id: requestId, professionalProfileId: professional.id },
      select: requestSelect,
    });
    if (!request) throw new NotFoundException('Verification request not found');
    return request;
  }

  private async withFileMetadata<
    T extends { evidence: Array<{ fileObjectId: string }> },
  >(requests: T[], accountId: string) {
    const fileIds = requests.flatMap((request) =>
      request.evidence.map((item) => item.fileObjectId),
    );
    const files = fileIds.length
      ? await this.prisma.fileObject.findMany({
          where: { id: { in: fileIds }, ownerAccountId: accountId },
          select: {
            id: true,
            originalName: true,
            mediaType: true,
            byteSize: true,
            validationStatus: true,
          },
        })
      : [];
    const byId = new Map(files.map((file) => [file.id, file]));
    return requests.map((request) => ({
      ...request,
      evidence: request.evidence.map((item) => ({
        ...item,
        file: byId.get(item.fileObjectId) ?? null,
      })),
    }));
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
}
