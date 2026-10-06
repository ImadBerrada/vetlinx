# Module ownership

Each module owns its persistence model and business rules. A module must not query or mutate another module's tables directly. Cross-module work uses a public application interface or a versioned domain event.

| Module | Owns | Publishes |
|---|---|---|
| Identity | Accounts, authentication identities, sessions, recovery, MFA state | `AccountCreated`, `EmailVerified`, `AccountSuspended` |
| Professionals | Professional profile, education, experience, specialties, species, languages, visibility | `ProfessionalCreated`, `ProfileCompleted`, `ProfilePublished` |
| Organizations | Organizations, facilities as identities, memberships, invitations, organization roles | `OrganizationCreated`, `OrganizationVerified`, `MembershipChanged` |
| Credentials | Credentials, evidence references, validity periods, append-only expiry/revocation history | `CredentialSubmitted`, `CredentialExpired`, `CredentialRevoked` |
| Verification | Verification requests, assignments, checks, decisions, confidence level, sources | `VerificationStarted`, `AdditionalInformationRequested`, `EvidenceVerified`, `VerificationRejected` |
| Recruitment | Vacancies, requirements, applications, shortlists, interviews, offers | `JobPublished`, `ApplicationSubmitted`, `InterviewScheduled`, `OfferAccepted` |
| Employment | Employment records, confirmation, start/end history | `EmploymentCreated`, `EmploymentVerified`, `EmploymentEnded` |
| Portfolio | Read model of trusted career evidence, public profile, CV configurations | `PortfolioUpdated`, `CvGenerated` |
| Files | File metadata, ownership, purpose, scanning state, retention state | `FileStored`, `FileScanPassed`, `FileQuarantined` |
| Notifications | Templates, delivery requests, preferences, delivery outcomes | `NotificationDelivered`, `NotificationFailed` |
| Taxonomy | Countries, authorities, professional titles, specialties, species, controlled vocabulary | `TaxonomyChanged` |
| Audit | Append-only security and business audit events | No domain events; receives all auditable actions |
| Owners (B2C foundation) | Private owner profiles and pet identities in `owners` | `PetRegistered` |
| Appointments (B2C foundation) | Service catalogue, dated slots, temporary holds, request snapshots, sharing consent, origin-aware proposals, arrival, status history and reminder markers in `appointments` | `AppointmentRequested`, `AppointmentStatusChanged`, `AppointmentCheckedIn`, `AppointmentTimeProposed`, `AppointmentTimeAccepted`, `AppointmentTimeProposalClosed` |
| Identity security | Identity-owned recovery/verification tokens, MFA secrets/challenges/recovery codes and session commands | `AccountPasswordReset`, `EmailVerified`, `MfaSecurityChanged` |
| Platform delivery | Encrypted email deliveries, event-consumer leases, heartbeat and retry state in `platform`; orchestrates public domain interfaces | No additional business events |
| Licensing (Phase 2) | Jurisdictions, authorities, licence types, pathway versions, professional pathway enrollments and requirement progress | `LicencePathwayPublished`, `PathwayEnrollmentStarted`, `RequirementProgressChanged`, `LicenceRenewalDue` |
| Learning (Phase 2) | Provider capability, learning products and versions, sessions, enrollments, progress, attendance, assessments, certificates and CPD | `LearningProductPublished`, `EnrollmentCreated`, `AttendanceConfirmed`, `CertificateIssued`, `CpdRecordCreated` |
| Owner/Animal extensions (Phase 3) | Animal identifiers and owner/caretaker relationship history, extending the B2C foundation | `AnimalRegistered`, `AnimalRelationshipChanged` |
| Consent/Appointment extensions (Phase 3) | Broader consent grants/withdrawals and facility schedules, extending request-scoped consent | `ConsentGranted`, `ConsentWithdrawn`, `AppointmentConfirmed` |
| Clinical Records (Phase 4) | Encounters, observations, diagnoses, procedures, prescriptions, orders, results, reports, amendments | `EncounterCompleted`, `PrescriptionIssued`, `ClinicalRecordAmended` |
| Billing and Entitlements (Phase 5) | Plans, entitlements, subscriptions, invoices, internal payment ledger | `EntitlementChanged`, `InvoiceIssued`, `PaymentRecorded` |
| Intelligence (Phase 5) | Governed analytical projections, benchmark definitions, approved model outputs | `ProjectionRefreshed`, `BenchmarkPublished` |

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

Future modules in this table describe approved boundaries, not current physical deployments or permission to expose unfinished routes.

Organizations owns the intake/scheduling flags and the transactional clinic policy interface. Appointments acquires that interface before capacity writes; catalogue management holds the organization exclusively, while bookings hold a shared policy lock and an exclusive slot lock. Owners supplies the current owner-controlled pet/contact snapshot under shared locks. Scheduling serializes competing owner holds through a transaction-scoped advisory mutex, without writing identity records. The worker calls the exported Appointments service for bounded temporary-hold cleanup. Catalogue writes are audited; appointment changes use the existing appointment events.

Appointments also owns clinic resources and immutable slot/resource assignments. Organization-exclusive management locks serialize cross-service interval reservations, release, reopening and resource retirement. A slot's resource reservation is independent of the number of appointment places; closing alone never frees a resource. Release checks active appointments/holds under the same lock held against booking commands. Reopening reacquires all active resources only if none has an overlapping reservation. Resource kinds are scheduling labels, not practitioner employment or licensing records. Resource metadata is scoped to the authorized clinic schedule and omitted from public/owner availability.
