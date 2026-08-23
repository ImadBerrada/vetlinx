# Module ownership

Each module owns its persistence model and business rules. A module must not query or mutate another module's tables directly. Cross-module work uses a public application interface or a versioned domain event.

| Module | Owns | Publishes |
|---|---|---|
| Identity | Accounts, authentication identities, sessions, recovery, MFA state | `AccountCreated`, `EmailVerified`, `AccountSuspended` |
| Professionals | Professional profile, education, experience, specialties, species, languages, visibility | `ProfessionalCreated`, `ProfileCompleted`, `ProfilePublished` |
| Organizations | Organizations, facilities as identities, memberships, invitations, organization roles | `OrganizationCreated`, `OrganizationVerified`, `MembershipChanged` |
| Credentials | Credentials, licences, evidence references, validity periods | `CredentialSubmitted`, `LicenceExpiring`, `CredentialRevoked` |
| Verification | Verification requests, assignments, checks, decisions, confidence level, sources | `VerificationStarted`, `AdditionalInformationRequested`, `EvidenceVerified`, `VerificationRejected` |
| Recruitment | Vacancies, requirements, applications, shortlists, interviews, offers | `JobPublished`, `ApplicationSubmitted`, `InterviewScheduled`, `OfferAccepted` |
| Employment | Employment records, confirmation, start/end history | `EmploymentCreated`, `EmploymentVerified`, `EmploymentEnded` |
| Portfolio | Read model of trusted career evidence, public profile, CV configurations | `PortfolioUpdated`, `CvGenerated` |
| Files | File metadata, ownership, purpose, scanning state, retention state | `FileStored`, `FileScanPassed`, `FileQuarantined` |
| Notifications | Templates, delivery requests, preferences, delivery outcomes | `NotificationDelivered`, `NotificationFailed` |
| Taxonomy | Countries, authorities, professional titles, specialties, species, controlled vocabulary | `TaxonomyChanged` |
| Audit | Append-only security and business audit events | No domain events; receives all auditable actions |

## Dependency direction

```text
HTTP adapter
  -> application use case
    -> domain model
      -> repository port
        -> infrastructure adapter
```

- Controllers contain transport concerns only.
- Application services coordinate use cases and transactions.
- Domain objects enforce invariants and allowed state transitions.
- Infrastructure implements persistence, queues, files, and external integrations.
- Public contracts are versioned independently from internal models.

## Extraction contract

A module is eligible to become a microservice when it has stable boundaries and at least one operational reason: independent scale, independent team ownership, security isolation, regulatory isolation, or a distinct technology workload.

Extraction must not require consumers to change business semantics. The module keeps its public commands, queries, event names, idempotency rules, and data identifiers.

