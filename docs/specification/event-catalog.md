# Domain event catalog

Events are stored in the PostgreSQL outbox with an aggregate ID, event type, schema version, payload, occurrence time, and processing state. Consumers must be idempotent and tolerate duplicates. Additive payload changes retain the current schema version; breaking changes create a new version.

| Event | Producer | Intended consumers |
|---|---|---|
| `AccountRegistered` | Identity | Notifications, analytics |
| `AccountPasswordReset` | Identity security | Security analytics |
| `EmailVerified` | Identity security | Contact readiness |
| `MfaSecurityChanged` | Identity security | Security analytics; payload contains action and account ID only |
| `ProfessionalProfileCreated` | Professionals | Search, analytics |
| `ProfessionalProfileUpdated` | Professionals | Search, portfolio |
| `CredentialCreated` | Credentials | Portfolio |
| `CredentialSubmitted` | Credentials | Verification, notifications |
| `VerificationRequestSubmitted` | Verification | Reviewer operations |
| `CredentialVerified` | Verification | Portfolio, search, notifications |
| `CredentialRejected` | Verification | Notifications |
| `CredentialExpired` | Credentials | Validity projections, notifications |
| `CredentialRevoked` | Credentials | Validity projections, notifications |
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
| `PetRegistered` | Owners | Owner projections, analytics |
| `ClinicBookingAvailabilityChanged` | Organizations | Public clinic directory |
| `AppointmentRequested` | Appointments | Clinic intake, notifications |
| `AppointmentStatusChanged` | Appointments | Owner/clinic projections, notifications |
| `AppointmentCheckedIn` | Appointments | Owner/clinic projections, notifications; arrival does not complete the visit |
| `AppointmentTimeProposed` | Appointments | Owner or clinic response and notifications; initiator identifies the responding side |
| `AppointmentTimeAccepted` | Appointments | Owner/clinic projections, notifications |
| `AppointmentTimeProposalClosed` | Appointments | Owner/clinic projections, notifications |

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

The separate delivery worker consumes version-1 appointment events and `CredentialVerified`, `CredentialRejected`, `VerificationInformationRequested`, `CredentialExpired`, `CredentialRevoked` to enqueue eligible verified-recipient email from existing in-app notices. Notification preferences are checked at fanout and again before external sending. Event delivery and outbox acknowledgement commit together; retries/dead letters are stored separately. All other events/versions remain pending until their intended handler exists and appear separately in delivery operations. This is a local notification consumer, not a distributed broker or a broadcast acknowledgement of every intended consumer. A future relay requires per-consumer acknowledgement semantics.
