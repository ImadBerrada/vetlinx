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
| `PathwayEnrollmentStarted` | Licensing | Professional dashboard, analytics |
| `RequirementProgressChanged` | Licensing | Readiness projection, notifications |
| `ExternalApplicationRecorded` | Licensing | Professional dashboard |
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
