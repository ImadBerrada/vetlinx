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

The MVP writes events durably but does not yet run a distributed broker. A future relay can claim unprocessed outbox rows and publish to Kafka/SNS/SQS without changing producers.
