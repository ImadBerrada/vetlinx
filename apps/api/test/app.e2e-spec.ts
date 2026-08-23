import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuditService } from './../src/modules/audit/audit.service';
import { PrismaService } from './../src/platform/persistence/prisma.service';
import {
  EVENT_PUBLISHER,
  type EventPublisher,
} from './../src/platform/events/event-publisher.port';
import {
  PRIVATE_FILE_STORAGE,
  type PrivateFileStorage,
} from './../src/platform/files/private-file-storage.port';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requiredString(value: unknown, key: string): string {
  if (!isRecord(value) || typeof value[key] !== 'string') {
    throw new Error(`Expected string field: ${key}`);
  }
  return value[key];
}

describe('VetLinX API (e2e)', () => {
  jest.setTimeout(30_000);
  let app: INestApplication<App>;
  let audit: AuditService;
  let events: EventPublisher;
  let prisma: PrismaService;
  let evidenceStorage: PrivateFileStorage;
  const auditResourceIds: string[] = [];
  const outboxIds: string[] = [];
  const accountIds: string[] = [];
  const profileIds: string[] = [];
  const credentialIds: string[] = [];
  const verificationRequestIds: string[] = [];
  const fileObjectIds: string[] = [];
  const evidenceObjectKeys: string[] = [];
  const organizationIds: string[] = [];
  const organizationVerificationRequestIds: string[] = [];
  const jobIds: string[] = [];
  const applicationIds: string[] = [];
  const interviewIds: string[] = [];
  const offerIds: string[] = [];
  const employmentIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    audit = app.get(AuditService);
    events = app.get<EventPublisher>(EVENT_PUBLISHER);
    prisma = app.get(PrismaService);
    evidenceStorage = app.get<PrivateFileStorage>(PRIVATE_FILE_STORAGE);
  });

  it('reports API health', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((response) => {
        const body: unknown = response.body;
        expect(isRecord(body)).toBe(true);
        if (!isRecord(body)) throw new Error('Expected a JSON object');

        expect(body.status).toBe('ok');
        expect(isRecord(body.info)).toBe(true);
        if (!isRecord(body.info) || !isRecord(body.info.api)) {
          throw new Error('Expected health information');
        }

        expect(body.info.api.status).toBe('up');
        expect(body.info.api.service).toBe('vetlinx-api');
        expect(isRecord(body.info.database)).toBe(true);
        if (!isRecord(body.info.database)) {
          throw new Error('Expected database health information');
        }
        expect(body.info.database.status).toBe('up');
      });
  });

  it('persists immutable audit events', async () => {
    const resourceId = randomUUID();
    const correlationId = randomUUID();
    auditResourceIds.push(resourceId);

    await audit.record({
      actorId: 'integration-test',
      action: 'professional.profile.created',
      resourceType: 'professional_profile',
      resourceId,
      occurredAt: new Date().toISOString(),
      correlationId,
      changes: { status: { to: 'DRAFT' } },
    });

    const persisted = await prisma.auditEvent.findFirstOrThrow({
      where: { resourceId, correlationId },
    });
    expect(persisted.action).toBe('professional.profile.created');
  });

  it('persists domain events to the outbox', async () => {
    const id = randomUUID();
    const aggregateId = randomUUID();
    outboxIds.push(id);

    await events.publish([
      {
        id,
        name: 'ProfessionalProfileCreated',
        version: 1,
        occurredAt: new Date().toISOString(),
        aggregateId,
        correlationId: randomUUID(),
        payload: { professionalProfileId: aggregateId },
      },
    ]);

    const persisted = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id },
    });
    expect(persisted.status).toBe('PENDING');
    expect(persisted.aggregateId).toBe(aggregateId);
  });

  it('exposes the modular architecture manifest', () => {
    return request(app.getHttpServer())
      .get('/api/v1/platform/modules')
      .expect(200)
      .expect((response) => {
        const body: unknown = response.body;
        expect(isRecord(body)).toBe(true);
        if (!isRecord(body)) throw new Error('Expected a JSON object');

        expect(body.architecture).toBe('modular-monolith');
        expect(Array.isArray(body.modules)).toBe(true);
        if (!Array.isArray(body.modules)) throw new Error('Expected modules');
        const modules: unknown[] = body.modules;

        const hasFoundationModule = (key: string) =>
          modules.some(
            (module: unknown) =>
              isRecord(module) &&
              module.key === key &&
              module.stage === 'foundation',
          );
        expect(hasFoundationModule('identity')).toBe(true);
        expect(hasFoundationModule('professionals')).toBe(true);
      });
  });

  it('registers, authenticates, rotates a session, and creates a profile', async () => {
    const email = `integration-${randomUUID()}@example.com`;
    const password = 'Correct-Horse-Battery-42';

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('x-correlation-id', randomUUID())
      .send({ email: email.toUpperCase(), password })
      .expect(201);

    const registrationBody: unknown = registration.body;
    const accessToken = requiredString(registrationBody, 'accessToken');
    const firstRefreshToken = requiredString(registrationBody, 'refreshToken');
    if (!isRecord(registrationBody) || !isRecord(registrationBody.account)) {
      throw new Error('Expected account registration response');
    }
    const accountId = requiredString(registrationBody.account, 'id');
    accountIds.push(accountId);
    expect(registrationBody.account.email).toBe(email);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(409);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({ accountId, email, roles: ['PROFESSIONAL'] });

    const profileResponse = await request(app.getHttpServer())
      .post('/api/v1/professionals/me')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ displayName: 'Dr. Integration Test', countryCode: 'ae' })
      .expect(201);
    const profileBody: unknown = profileResponse.body;
    const profileId = requiredString(profileBody, 'id');
    profileIds.push(profileId);
    if (!isRecord(profileBody)) throw new Error('Expected profile response');
    expect(profileBody.countryCode).toBe('AE');

    await request(app.getHttpServer())
      .get('/api/v1/professionals/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(requiredString(response.body as unknown, 'id')).toBe(profileId);
      });

    await request(app.getHttpServer())
      .post('/api/v1/credentials/me')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        typeCode: 'DEGREE',
        title: 'Doctor of Veterinary Medicine',
        issuingOrganization: 'Integration University',
        countryCode: 'ae',
        issueDate: '2024-06-30',
        expiryDate: '2020-06-30',
      })
      .expect(400);

    const credentialResponse = await request(app.getHttpServer())
      .post('/api/v1/credentials/me')
      .set('authorization', `Bearer ${accessToken}`)
      .set('x-correlation-id', randomUUID())
      .send({
        typeCode: 'DEGREE',
        title: 'Doctor of Veterinary Medicine',
        issuingOrganization: 'Integration University',
        countryCode: 'ae',
        issueDate: '2020-06-30',
      })
      .expect(201);
    const credentialId = requiredString(
      credentialResponse.body as unknown,
      'id',
    );
    credentialIds.push(credentialId);
    expect(requiredString(credentialResponse.body as unknown, 'status')).toBe(
      'DRAFT',
    );

    await request(app.getHttpServer())
      .get('/api/v1/credentials/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        const body: unknown = response.body;
        expect(Array.isArray(body)).toBe(true);
        if (!Array.isArray(body)) throw new Error('Expected credential list');
        expect(
          body.some((item) => requiredString(item, 'id') === credentialId),
        ).toBe(true);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/credentials/me/${credentialId}/submit`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(requiredString(response.body as unknown, 'status')).toBe(
          'SUBMITTED',
        );
      });

    await request(app.getHttpServer())
      .post(`/api/v1/credentials/me/${credentialId}/submit`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    const verificationResponse = await request(app.getHttpServer())
      .post(`/api/v1/verification-requests/me/credentials/${credentialId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .set('x-correlation-id', randomUUID())
      .expect(201);
    const verificationRequestId = requiredString(
      verificationResponse.body as unknown,
      'id',
    );
    verificationRequestIds.push(verificationRequestId);
    expect(requiredString(verificationResponse.body as unknown, 'status')).toBe(
      'EVIDENCE_REQUIRED',
    );

    await request(app.getHttpServer())
      .post(`/api/v1/verification-requests/me/${randomUUID()}/evidence`)
      .set('authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('%PDF-1.4\nVetLinX test evidence'), {
        filename: 'qualification.pdf',
        contentType: 'application/pdf',
      })
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `/api/v1/verification-requests/me/${verificationRequestId}/evidence`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('not a real PDF'), {
        filename: 'invalid.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    const evidenceResponse = await request(app.getHttpServer())
      .post(
        `/api/v1/verification-requests/me/${verificationRequestId}/evidence`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .set('x-correlation-id', randomUUID())
      .attach('file', Buffer.from('%PDF-1.4\nVetLinX test evidence'), {
        filename: 'qualification.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(requiredString(evidenceResponse.body as unknown, 'status')).toBe(
      'READY_TO_SUBMIT',
    );
    if (
      !isRecord(evidenceResponse.body) ||
      !Array.isArray(evidenceResponse.body.evidence) ||
      !isRecord(evidenceResponse.body.evidence[0])
    ) {
      throw new Error('Expected verification evidence response');
    }
    const evidenceFileObjectId = requiredString(
      evidenceResponse.body.evidence[0],
      'fileObjectId',
    );
    const evidenceId = requiredString(evidenceResponse.body.evidence[0], 'id');
    fileObjectIds.push(evidenceFileObjectId);
    const storedFile = await prisma.fileObject.findUniqueOrThrow({
      where: { id: evidenceFileObjectId },
    });
    evidenceObjectKeys.push(storedFile.objectKey);
    expect(storedFile.checksumSha256).toHaveLength(64);
    expect(storedFile.validationStatus).toBe('VALIDATED');

    await request(app.getHttpServer())
      .get('/api/v1/verification-requests/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        const body: unknown = response.body;
        if (!Array.isArray(body) || !isRecord(body[0])) {
          throw new Error('Expected verification request list');
        }
        expect(requiredString(body[0], 'id')).toBe(verificationRequestId);
        expect(JSON.stringify(body)).not.toContain('objectKey');
        expect(JSON.stringify(body)).not.toContain('checksumSha256');
      });

    await request(app.getHttpServer())
      .post(`/api/v1/verification-requests/me/${verificationRequestId}/submit`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(requiredString(response.body as unknown, 'status')).toBe(
          'SUBMITTED',
        );
      });

    await request(app.getHttpServer())
      .post(
        `/api/v1/verification-requests/me/${verificationRequestId}/evidence`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('%PDF-1.4\nLate evidence'), {
        filename: 'late.pdf',
        contentType: 'application/pdf',
      })
      .expect(409);

    await request(app.getHttpServer())
      .get('/api/v1/verification-reviews')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(403);

    const reviewerEmail = `reviewer-${randomUUID()}@example.com`;
    const reviewerRegistration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: reviewerEmail, password })
      .expect(201);
    if (
      !isRecord(reviewerRegistration.body) ||
      !isRecord(reviewerRegistration.body.account)
    ) {
      throw new Error('Expected reviewer account response');
    }
    const reviewerAccountId = requiredString(
      reviewerRegistration.body.account,
      'id',
    );
    accountIds.push(reviewerAccountId);
    const reviewerToken = requiredString(
      reviewerRegistration.body,
      'accessToken',
    );
    await prisma.accountSystemRole.create({
      data: {
        accountId: reviewerAccountId,
        role: 'REVIEWER',
        grantedBy: 'e2e-test',
      },
    });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${reviewerToken}`)
      .expect(200)
      .expect((response) => {
        if (!isRecord(response.body) || !Array.isArray(response.body.roles)) {
          throw new Error('Expected current reviewer roles');
        }
        expect(response.body.roles).toContain('REVIEWER');
      });

    await request(app.getHttpServer())
      .get('/api/v1/verification-reviews')
      .set('authorization', `Bearer ${reviewerToken}`)
      .expect(200)
      .expect((response) => {
        const body: unknown = response.body;
        if (!Array.isArray(body)) throw new Error('Expected review queue');
        expect(
          body.some(
            (item) => requiredString(item, 'id') === verificationRequestId,
          ),
        ).toBe(true);
        expect(JSON.stringify(body)).not.toContain('objectKey');
        expect(JSON.stringify(body)).not.toContain('checksumSha256');
      });

    await request(app.getHttpServer())
      .post(`/api/v1/verification-reviews/${verificationRequestId}/approve`)
      .set('authorization', `Bearer ${reviewerToken}`)
      .send({})
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/v1/verification-reviews/${verificationRequestId}/start`)
      .set('authorization', `Bearer ${reviewerToken}`)
      .expect(200)
      .expect((response) => {
        expect(requiredString(response.body as unknown, 'status')).toBe(
          'UNDER_REVIEW',
        );
      });

    await request(app.getHttpServer())
      .get(
        `/api/v1/verification-reviews/${verificationRequestId}/evidence/${evidenceId}`,
      )
      .set('authorization', `Bearer ${reviewerToken}`)
      .expect('content-type', /application\/pdf/)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/verification-reviews/${verificationRequestId}/approve`)
      .set('authorization', `Bearer ${reviewerToken}`)
      .send({ reason: 'Evidence and credential details match.' })
      .expect(200)
      .expect((response) => {
        expect(requiredString(response.body as unknown, 'status')).toBe(
          'VERIFIED',
        );
        if (
          !isRecord(response.body) ||
          !Array.isArray(response.body.decisions)
        ) {
          throw new Error('Expected immutable decision history');
        }
        expect(response.body.decisions).toHaveLength(1);
      });

    const verifiedCredential = await prisma.credential.findUniqueOrThrow({
      where: { id: credentialId },
    });
    expect(verifiedCredential.status).toBe('VERIFIED');

    const notificationsResponse = await request(app.getHttpServer())
      .get('/api/v1/notifications/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    const notificationsBody: unknown = notificationsResponse.body;
    if (!Array.isArray(notificationsBody) || !isRecord(notificationsBody[0])) {
      throw new Error('Expected a professional notification');
    }
    expect(requiredString(notificationsBody[0], 'kind')).toBe(
      'CREDENTIAL_VERIFIED',
    );
    const notificationId = requiredString(notificationsBody[0], 'id');
    await request(app.getHttpServer())
      .post(`/api/v1/notifications/me/${notificationId}/read`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(requiredString(response.body as unknown, 'status')).toBe('READ');
      });

    await request(app.getHttpServer())
      .post(`/api/v1/verification-reviews/${verificationRequestId}/reject`)
      .set('authorization', `Bearer ${reviewerToken}`)
      .send({ reason: 'A terminal decision cannot be replaced.' })
      .expect(409);

    const organizationResponse = await request(app.getHttpServer())
      .post('/api/v1/organizations/me')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        legalName: 'Integration Veterinary Clinic LLC',
        publicName: 'Integration Veterinary Clinic',
        type: 'CLINIC',
        countryCode: 'ae',
        email,
        phone: '+971501234567',
        website: 'https://integration-vet.example',
        addressLine1: 'Test Street 1',
        city: 'Dubai',
      })
      .expect(201);
    if (
      !isRecord(organizationResponse.body) ||
      !isRecord(organizationResponse.body.organization) ||
      !isRecord(organizationResponse.body.verification)
    ) {
      throw new Error('Expected organization workspace');
    }
    const organizationId = requiredString(
      organizationResponse.body.organization,
      'id',
    );
    organizationIds.push(organizationId);
    const organizationVerificationRequestId = requiredString(
      organizationResponse.body.verification,
      'id',
    );
    organizationVerificationRequestIds.push(organizationVerificationRequestId);
    expect(requiredString(organizationResponse.body.membership, 'role')).toBe(
      'OWNER',
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/me/${organizationId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ region: 'Dubai' })
      .expect(200)
      .expect((response) => {
        expect(requiredString(response.body as unknown, 'region')).toBe(
          'Dubai',
        );
      });

    const organizationEvidenceResponse = await request(app.getHttpServer())
      .post(`/api/v1/organizations/me/${organizationId}/verification/evidence`)
      .set('authorization', `Bearer ${accessToken}`)
      .attach(
        'file',
        Buffer.from('%PDF-1.4\nOrganization registration evidence'),
        {
          filename: 'business-registration.pdf',
          contentType: 'application/pdf',
        },
      )
      .expect(201);
    if (
      !isRecord(organizationEvidenceResponse.body) ||
      !Array.isArray(organizationEvidenceResponse.body.evidence) ||
      !isRecord(organizationEvidenceResponse.body.evidence[0])
    ) {
      throw new Error('Expected organization evidence');
    }
    const organizationEvidenceId = requiredString(
      organizationEvidenceResponse.body.evidence[0],
      'id',
    );
    const organizationFileObjectId = requiredString(
      organizationEvidenceResponse.body.evidence[0],
      'fileObjectId',
    );
    fileObjectIds.push(organizationFileObjectId);
    const organizationFileObject = await prisma.fileObject.findUniqueOrThrow({
      where: { id: organizationFileObjectId },
    });
    evidenceObjectKeys.push(organizationFileObject.objectKey);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/me/${organizationId}/verification/submit`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(requiredString(response.body as unknown, 'status')).toBe(
          'SUBMITTED',
        );
      });

    await request(app.getHttpServer())
      .get('/api/v1/organization-reviews')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `/api/v1/organization-reviews/${organizationVerificationRequestId}/start`,
      )
      .set('authorization', `Bearer ${reviewerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(
        `/api/v1/organization-reviews/${organizationVerificationRequestId}/evidence/${organizationEvidenceId}`,
      )
      .set('authorization', `Bearer ${reviewerToken}`)
      .expect('content-type', /application\/pdf/)
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `/api/v1/organization-reviews/${organizationVerificationRequestId}/approve`,
      )
      .set('authorization', `Bearer ${reviewerToken}`)
      .send({
        reason: 'Business registration evidence matches the organization.',
      })
      .expect(200)
      .expect((response) => {
        if (!isRecord(response.body) || !isRecord(response.body.organization)) {
          throw new Error('Expected reviewed organization');
        }
        expect(requiredString(response.body.organization, 'status')).toBe(
          'VERIFIED',
        );
      });

    const memberEmail = `member-${randomUUID()}@example.com`;
    const memberRegistration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: memberEmail, password })
      .expect(201);
    if (
      !isRecord(memberRegistration.body) ||
      !isRecord(memberRegistration.body.account)
    ) {
      throw new Error('Expected invited member account');
    }
    const memberAccountId = requiredString(
      memberRegistration.body.account,
      'id',
    );
    accountIds.push(memberAccountId);
    const memberToken = requiredString(memberRegistration.body, 'accessToken');

    const invitationResponse = await request(app.getHttpServer())
      .post(`/api/v1/organizations/me/${organizationId}/invitations`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ email: memberEmail, role: 'STAFF' })
      .expect(201);
    const invitationToken = requiredString(
      invitationResponse.body as unknown,
      'invitationToken',
    );
    const storedInvitation =
      await prisma.organizationInvitation.findFirstOrThrow({
        where: { organizationId, email: memberEmail },
      });
    expect(storedInvitation.tokenHash).not.toBe(invitationToken);

    await request(app.getHttpServer())
      .post('/api/v1/organizations/invitations/accept')
      .set('authorization', `Bearer ${memberToken}`)
      .send({ token: invitationToken })
      .expect(200)
      .expect((response) => {
        if (!isRecord(response.body) || !isRecord(response.body.membership)) {
          throw new Error('Expected accepted organization membership');
        }
        expect(requiredString(response.body.membership, 'role')).toBe('STAFF');
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/me/${organizationId}`)
      .set('authorization', `Bearer ${memberToken}`)
      .send({ city: 'Abu Dhabi' })
      .expect(403);

    const candidateEmail = `candidate-${randomUUID()}@example.com`;
    const candidateRegistration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: candidateEmail, password })
      .expect(201);
    if (
      !isRecord(candidateRegistration.body) ||
      !isRecord(candidateRegistration.body.account)
    ) {
      throw new Error('Expected candidate account');
    }
    const candidateAccountId = requiredString(
      candidateRegistration.body.account,
      'id',
    );
    const candidateToken = requiredString(
      candidateRegistration.body,
      'accessToken',
    );
    accountIds.push(candidateAccountId);
    const candidateProfileResponse = await request(app.getHttpServer())
      .post('/api/v1/professionals/me')
      .set('authorization', `Bearer ${candidateToken}`)
      .send({ displayName: 'Dr. Verified Candidate', countryCode: 'ae' })
      .expect(201);
    const candidateProfileId = requiredString(
      candidateProfileResponse.body as unknown,
      'id',
    );
    profileIds.push(candidateProfileId);
    const candidateCredential = await prisma.credential.create({
      data: {
        professionalProfileId: candidateProfileId,
        typeCode: 'LICENCE',
        title: 'UAE Veterinary Licence',
        issuingOrganization: 'Integration Authority',
        countryCode: 'AE',
        issueDate: new Date('2025-01-01'),
        status: 'VERIFIED',
      },
    });
    credentialIds.push(candidateCredential.id);

    const jobResponse = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/jobs`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Small Animal Veterinarian',
        description:
          'Deliver evidence-based small animal care in a collaborative clinical team.',
        countryCode: 'ae',
        city: 'Dubai',
        employmentType: 'FULL_TIME',
        workMode: 'ON_SITE',
        minExperienceYears: 2,
        salaryMinMonthly: 12000,
        salaryMaxMonthly: 18000,
        currencyCode: 'aed',
        requirements: [
          {
            category: 'LICENCE',
            valueCode: 'licence',
            label: 'UAE Veterinary Licence',
            required: true,
          },
        ],
      })
      .expect(201);
    const jobId = requiredString(jobResponse.body as unknown, 'id');
    jobIds.push(jobId);
    expect(requiredString(jobResponse.body as unknown, 'status')).toBe('DRAFT');

    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${organizationId}/jobs/${jobId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ title: 'Senior Small Animal Veterinarian' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/jobs/${jobId}/publish`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) =>
        expect(requiredString(response.body as unknown, 'status')).toBe(
          'PUBLISHED',
        ),
      );

    await request(app.getHttpServer())
      .get('/api/v1/jobs?q=Senior&countryCode=ae')
      .set('authorization', `Bearer ${candidateToken}`)
      .expect(200)
      .expect((response) => {
        if (!Array.isArray(response.body))
          throw new Error('Expected published jobs');
        expect(
          response.body.some((item) => requiredString(item, 'id') === jobId),
        ).toBe(true);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/applications`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ coverNote: 'I should not apply to my own organization.' })
      .expect(409);

    const applicationResponse = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/applications`)
      .set('authorization', `Bearer ${candidateToken}`)
      .send({
        coverNote:
          'Experienced small animal clinician with a verified local licence.',
      })
      .expect(201);
    const applicationId = requiredString(
      applicationResponse.body as unknown,
      'id',
    );
    applicationIds.push(applicationId);

    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/applications`)
      .set('authorization', `Bearer ${candidateToken}`)
      .send({})
      .expect(409);

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/jobs/${jobId}/applications`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        if (!Array.isArray(response.body) || !isRecord(response.body[0]))
          throw new Error('Expected application');
        expect(requiredString(response.body[0], 'id')).toBe(applicationId);
      });

    await request(app.getHttpServer())
      .get(
        `/api/v1/organizations/${organizationId}/candidates?credentialType=licence`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        if (!Array.isArray(response.body))
          throw new Error('Expected candidates');
        expect(
          response.body.some(
            (item) => requiredString(item, 'id') === candidateProfileId,
          ),
        ).toBe(true);
      });

    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/${organizationId}/applications/${applicationId}/status`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .send({ status: 'SHORTLISTED' })
      .expect(200);

    const interviewStartsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const interviewEndsAt = new Date(
      interviewStartsAt.getTime() + 45 * 60 * 1000,
    );
    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/applications/${applicationId}/interviews`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        startsAt: interviewStartsAt.toISOString(),
        endsAt: interviewEndsAt.toISOString(),
        timeZone: 'Asia/Dubai',
        mode: 'VIDEO',
      })
      .expect(409);

    const interviewResponse = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/applications/${applicationId}/interviews`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        startsAt: interviewStartsAt.toISOString(),
        endsAt: interviewEndsAt.toISOString(),
        timeZone: 'Asia/Dubai',
        mode: 'VIDEO',
        joinUrl: 'https://meet.example.com/vetlinx-integration',
        notes: 'Structured clinical and culture interview.',
      })
      .expect(201);
    const interviewId = requiredString(interviewResponse.body as unknown, 'id');
    interviewIds.push(interviewId);

    await request(app.getHttpServer())
      .get('/api/v1/interviews/me')
      .set('authorization', `Bearer ${candidateToken}`)
      .expect(200)
      .expect((response) => {
        if (!Array.isArray(response.body))
          throw new Error('Expected interviews');
        expect(
          response.body.some(
            (item) => requiredString(item, 'id') === interviewId,
          ),
        ).toBe(true);
      });

    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/${organizationId}/interviews/${interviewId}/status`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    const offerExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const proposedStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const offerResponse = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/applications/${applicationId}/offers`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        salaryMonthly: 16000,
        currencyCode: 'aed',
        proposedStartDate: proposedStartDate.toISOString(),
        expiresAt: offerExpiry.toISOString(),
        terms:
          'Full-time employment subject to identity, licence, and employment checks.',
      })
      .expect(201);
    const offerId = requiredString(offerResponse.body as unknown, 'id');
    offerIds.push(offerId);

    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${organizationId}/offers/${offerId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ salaryMonthly: 16500 })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/offers/${offerId}/send`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) =>
        expect(requiredString(response.body as unknown, 'status')).toBe('SENT'),
      );

    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/applications/${applicationId}/offers`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        salaryMonthly: 17000,
        currencyCode: 'AED',
        proposedStartDate: proposedStartDate.toISOString(),
        expiresAt: offerExpiry.toISOString(),
        terms:
          'A duplicate active offer must not be created for this application.',
      })
      .expect(409);

    await request(app.getHttpServer())
      .get('/api/v1/offers/me')
      .set('authorization', `Bearer ${candidateToken}`)
      .expect(200)
      .expect((response) => {
        if (!Array.isArray(response.body) || !isRecord(response.body[0])) {
          throw new Error('Expected candidate offer');
        }
        expect(requiredString(response.body[0], 'status')).toBe('SENT');
      });

    await request(app.getHttpServer())
      .post(`/api/v1/offers/me/${offerId}/respond`)
      .set('authorization', `Bearer ${candidateToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(200)
      .expect((response) =>
        expect(requiredString(response.body as unknown, 'status')).toBe(
          'ACCEPTED',
        ),
      );

    await request(app.getHttpServer())
      .post(`/api/v1/offers/me/${offerId}/respond`)
      .set('authorization', `Bearer ${candidateToken}`)
      .send({ status: 'DECLINED', reason: 'Cannot replace acceptance.' })
      .expect(409);

    const employmentResponse = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/offers/${offerId}/employment`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .expect(201);
    const employmentId = requiredString(
      employmentResponse.body as unknown,
      'id',
    );
    employmentIds.push(employmentId);
    expect(requiredString(employmentResponse.body as unknown, 'status')).toBe(
      'CONFIRMED',
    );

    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/offers/${offerId}/employment`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/employments/${employmentId}/activate`,
      )
      .set('authorization', `Bearer ${accessToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .get('/api/v1/employments/me')
      .set('authorization', `Bearer ${candidateToken}`)
      .expect(200)
      .expect((response) => {
        if (!Array.isArray(response.body) || !isRecord(response.body[0])) {
          throw new Error('Expected confirmed employment');
        }
        expect(requiredString(response.body[0], 'id')).toBe(employmentId);
        expect(requiredString(response.body[0], 'verificationSource')).toBe(
          'ORGANIZATION_CONFIRMED',
        );
      });

    const activatedCandidateProfile =
      await prisma.professionalProfile.findUniqueOrThrow({
        where: { id: candidateProfileId },
      });
    expect(activatedCandidateProfile.status).toBe('ACTIVE');

    const portfolioSettings = await request(app.getHttpServer())
      .patch('/api/v1/professionals/me')
      .set('authorization', `Bearer ${candidateToken}`)
      .send({
        headline: 'Small animal veterinarian',
        summary:
          'Evidence-based clinician focused on compassionate small animal care.',
        specialtyCodes: ['small_animal_medicine'],
        speciesCodes: ['canine', 'feline'],
        languageCodes: ['en', 'ar'],
        visibility: 'PUBLIC',
        contactVisibility: 'PRIVATE',
      })
      .expect(200);
    const publicSlug = requiredString(
      portfolioSettings.body as unknown,
      'publicSlug',
    );

    await request(app.getHttpServer())
      .get('/api/v1/portfolio/me')
      .set('authorization', `Bearer ${candidateToken}`)
      .expect(200)
      .expect((response) => {
        if (!isRecord(response.body) || !isRecord(response.body.trust)) {
          throw new Error('Expected private portfolio');
        }
        expect(response.body.trust.verifiedCredentialCount).toBe(1);
        expect(response.body.trust.verifiedEmploymentCount).toBe(1);
      });

    await request(app.getHttpServer())
      .get(`/api/v1/portfolio/public/${publicSlug}`)
      .expect(200)
      .expect((response) => {
        if (!isRecord(response.body))
          throw new Error('Expected public portfolio');
        expect(response.body.email).toBeNull();
        expect(JSON.stringify(response.body)).not.toContain(candidateEmail);
      });

    await request(app.getHttpServer())
      .get('/api/v1/portfolio/me/cv.txt')
      .set('authorization', `Bearer ${candidateToken}`)
      .expect('content-type', /text\/plain/)
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain('VERIFIED CREDENTIALS');
        expect(response.text).toContain('VERIFIED EMPLOYMENT');
        expect(response.text).toContain('Senior Small Animal Veterinarian');
      });

    await request(app.getHttpServer())
      .get('/api/v1/applications/me')
      .set('authorization', `Bearer ${candidateToken}`)
      .expect(200)
      .expect((response) => {
        if (!Array.isArray(response.body) || !isRecord(response.body[0]))
          throw new Error('Expected candidate application');
        expect(requiredString(response.body[0], 'status')).toBe('HIRED');
      });

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/jobs`)
      .set('authorization', `Bearer ${memberToken}`)
      .expect(403);

    const rotation = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(200);
    const rotatedRefreshToken = requiredString(
      rotation.body as unknown,
      'refreshToken',
    );
    expect(rotatedRefreshToken).not.toBe(firstRefreshToken);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'definitely-incorrect' })
      .expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    expect(requiredString(login.body as unknown, 'accessToken')).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: rotatedRefreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotatedRefreshToken })
      .expect(401);
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({
      where: { actorId: { in: accountIds } },
    });
    await prisma.outboxEvent.deleteMany({
      where: {
        aggregateId: {
          in: [
            ...accountIds,
            ...profileIds,
            ...credentialIds,
            ...verificationRequestIds,
            ...organizationIds,
            ...jobIds,
            ...applicationIds,
            ...interviewIds,
            ...offerIds,
            ...employmentIds,
          ],
        },
      },
    });
    await prisma.verificationDecision.deleteMany({
      where: { verificationRequestId: { in: verificationRequestIds } },
    });
    await prisma.organizationVerificationDecision.deleteMany({
      where: {
        verificationRequestId: {
          in: organizationVerificationRequestIds,
        },
      },
    });
    await prisma.employment.deleteMany({
      where: { id: { in: employmentIds } },
    });
    await prisma.jobApplication.deleteMany({
      where: { id: { in: applicationIds } },
    });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.verificationRequest.deleteMany({
      where: { id: { in: verificationRequestIds } },
    });
    await prisma.fileObject.deleteMany({
      where: { id: { in: fileObjectIds } },
    });
    await Promise.all(
      evidenceObjectKeys.map((objectKey) => evidenceStorage.remove(objectKey)),
    );
    await prisma.credential.deleteMany({
      where: { id: { in: credentialIds } },
    });
    await prisma.professionalProfile.deleteMany({
      where: { id: { in: profileIds } },
    });
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await prisma.auditEvent.deleteMany({
      where: { resourceId: { in: auditResourceIds } },
    });
    await prisma.outboxEvent.deleteMany({ where: { id: { in: outboxIds } } });
    await app.close();
  });
});
