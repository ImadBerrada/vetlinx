# Domain event catalog

Events are stored in the PostgreSQL outbox with an aggregate ID, event type, schema version, payload, occurrence time, and processing state. Consumers must be idempotent and tolerate duplicates. Additive payload changes retain the current schema version; breaking changes create a new version.

| Event | Producer | Intended consumers |
|---|---|---|
| `AccountRegistered` | Identity | Notifications, analytics |
| `ProfessionalProfileCreated` | Professionals | Search, analytics |
| `ProfessionalProfileUpdated` | Professionals | Search, portfolio |
| `CredentialCreated` | Credentials | Portfolio |
| `CredentialSubmitted` | Credentials | Verification, notifications |
| `VerificationRequestSubmitted` | Verification | Reviewer operations |
| `CredentialVerified` | Verification | Portfolio, search, notifications |
| `CredentialRejected` | Verification | Notifications |
| `OrganizationCreated` | Organizations | Search, analytics |
| `OrganizationVerificationSubmitted` | Organizations | Reviewer operations |
| `OrganizationVerified` | Organizations | Recruitment, notifications |
| `OrganizationInvitationCreated` | Organizations | Notifications |
| `JobPublished` | Recruitment | Search, matching, notifications |
| `ApplicationSubmitted` | Recruitment | Employer notifications, analytics |
| `ApplicationStatusChanged` | Recruitment | Candidate notifications |
| `InterviewScheduled` | Recruitment | Candidate/employer notifications |
| `OfferSent` | Recruitment | Candidate notifications |
| `OfferAccepted` | Recruitment | Employer notifications |
| `EmploymentConfirmed` | Recruitment | Portfolio, search, analytics |
| `EmploymentActivated` | Recruitment | Portfolio, analytics |
| `EmploymentEnded` | Recruitment | Portfolio, analytics |
| `ProfessionalPortfolioUpdated` | Recruitment/Professionals | Portfolio projection, search |

## Planned Phase 2 events

These names define the approved integration vocabulary. They are implemented only with the corresponding Phase 2 use case.

| Event | Producer | Intended consumers |
|---|---|---|
| `LicencePathwayPublished` | Licensing | Search, notifications, audit analytics |
| `LicencePathwaySuperseded` | Licensing | Active-enrollment review, notifications |
| `PathwayEnrollmentStarted` v1 | Licensing | Professional dashboard, analytics |
| `PathwayEnrollmentWithdrawn` v1 | Licensing | Professional dashboard, analytics |
| `RequirementProgressChanged` v1 | Licensing | Readiness projection, notifications |
| `ExternalLicenceApplicationReported` v1 | Licensing | Professional dashboard |
| `LicencePathwaySubmitted` v1 | Licensing | Reviewer operations, audit analytics |
| `LicenceRenewalDue` | Licensing | Notifications, portfolio |
| `LearningProductPublished` | Learning | Catalogue search, notifications |
| `EnrollmentCreated` | Learning | Provider workspace, professional dashboard |
| `LearningProgressChanged` | Learning | Professional dashboard |
| `AttendanceConfirmed` | Learning | Completion evaluation, provider reporting |
| `AssessmentCompleted` | Learning | Completion evaluation |
| `CertificateIssued` | Learning | CPD, portfolio, licensing readiness, notifications |
| `CertificateRevoked` | Learning | CPD, portfolio, licensing readiness, notifications |
| `CpdRecordCreated` | Learning | Portfolio, licensing readiness |

The MVP writes events durably but does not yet run a distributed broker. A future relay can claim unprocessed outbox rows and publish to Kafka/SNS/SQS without changing producers.

The Phase 2A implementation uses the exact v1 names above. `ExternalLicenceApplicationReported` deliberately encodes that the record is user-reported; it replaces the earlier planned `ExternalApplicationRecorded` vocabulary before any external consumer was released.
