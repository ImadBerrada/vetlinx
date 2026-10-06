# Product implementation and roadmap

Applied on 2026-10-06 following the authorized product/architecture proposal. This is a delivery record and an ordered implementation plan; planned items are not advertised as working features.

## Product structure

One identity can act as a professional, pet owner, and organization member. Personal workspace selection never grants permissions. A persistent labelled workspace switcher exposes both personal profiles, with setup links for a missing profile. Organization and reviewer workspaces are authorized independently.

The professional navigation is Home, Profile, Credentials, Jobs, Applications, and Portfolio/CV. The owner navigation is Home/Pets, Find a clinic, Appointments, and account settings. Clinic staff have an appointment intake/queue inside their authorized organization workspace. Progressive onboarding requests only information needed for the next action; authentication preserves a safe return path to the selected clinic.

Every actionable screen must explain its current state and next step, retain inputs after errors, distinguish loading from empty results, and provide keyboard focus and mobile layouts. A directory lists only facts actually recorded by verified opted-in organizations. No invented ratings, availability, recommendations, clinical claims, or dashboard metrics are used.

## Applied increment

| Area | Working behavior | Boundary |
|---|---|---|
| Identity | One login, password recovery, email verification, redacted device sessions, device/all-device sign-out | Privileged MFA and compromised-password policy remain launch gates |
| Workspaces | Explicit Professional/Pet owner switcher; canonical `/professional`; application navigation | Organization roles remain independent |
| Professional | Existing structured profile, credentials/review, privacy, public portfolio, CV, jobs and application/interview/offer/employment loop retained | Licensing/CPD/paid learning not yet built |
| Owner | Private owner details, multiple pets, editing/archive, clinic discovery and consented requests | Household delegation and ownership transfer not yet built |
| Clinic | Verified directory opt-in, scoped staff queue, confirmations/declines/cancellation/completion | Time requests have no resource/slot reservation |
| Appointment follow-through | Versioned time proposals, explicit owner acceptance/rejection, expiry, original-time preservation, history/filtering | Arrival/no-show and resource scheduling are next increments |
| Notifications | In-app updates, encrypted durable email jobs, bounded retries/leases, dead-letter retry API, worker heartbeat, upcoming confirmed-visit reminders | Real SMTP must be configured; preferences/SMS not built |
| Evidence protection | Only assigned reviewer or platform administrator can read review evidence, with access audit | Malware scanning and retention automation remain gates |
| Operations | Explicit backup targets, archive validation, SHA-256 manifest, guarded transactional restore; successful isolated restore drill | Scheduled offsite database/evidence backup and alerting must be deployed |

## Architecture that supports further implementation

Keep the current Next.js BFF, NestJS modular monolith and PostgreSQL schema ownership. Domain modules own their records and state machines. Other modules use public application interfaces; the platform worker orchestrates those interfaces and owns delivery leases, not owner/clinical mutations. Do not split into network services until measured operational needs justify the extra failure modes.

Authentication checks account status, account authentication version and an active refresh-session family on each protected request. Login, refresh, recovery and session revocation share an account-row lock. Recovery tokens are random, hashed, purpose-bound, expiring, single-use and explicitly submitted. Email links carry token fragments, which browser forms remove from history before user interaction. Queued message bodies are encrypted; delivered/cancelled content is purged. A stable separately managed encryption key is required in production.

Appointment commands own history and optimistic proposal versions. Transactional audit/outbox/in-app notices accompany state changes. Request snapshots preserve the consented owner/pet/clinic information at submission. Proposed times remain separate from the authoritative appointment time until accepted. This is the base for later resource reservations; it is not availability enforcement.

The delivery worker runs separately from API instances. It handles only explicitly supported event names/versions and uses transactional local consumer acknowledgement. Unsupported events remain pending for future handlers. Email transport is at-least-once: a crash after SMTP accepts but before the database acknowledgement can cause a duplicate; stable Message-IDs and idempotent queue keys reduce duplication but cannot promise exactly-once external delivery. Reminders are deduplicated per appointment/time and unsent reminders are cancelled when their appointment becomes stale. A cancellation concurrent with an already-started external send cannot retract email.

Web refresh coordination is currently scoped to one process. Shared refresh coordination is a prerequisite for multiple web replicas. Appointment membership authorization currently occurs before the domain transaction; stricter revocation-during-in-flight-command semantics require a transactionally coordinated organization policy interface.

## Ordered remaining delivery

1. **Public pilot readiness:** privileged MFA/recovery codes, approved consent/privacy/terms, account export/deletion/retention policies, evidence scanning/quarantine, notification preferences, support/reporting, operational dashboards/alerts, secret management and monitored offsite backups. Finish credential expiry/revocation commands and evidence-access regression checks. Validate accessibility, Arabic/RTL copy, onboarding with real owners/professionals, rate limits, load and disaster recovery. Release evidence: independent security/privacy review and operational owners.
2. **Reliable care coordination:** governed clinic service catalogue, facility/branch access, staffed hours, practitioner/resource availability, slot holds with expiry and conflict constraints, waitlists, check-in/no-show, owner-requested rescheduling, care-team delegation and pet ownership transfer with consent. Release evidence: concurrent reservation tests, timezone/DST tests, facility permission tests and real clinic scheduling pilot.
3. **Professional growth:** sourced/versioned licensing pathways with curators/reviewers, explainable eligibility/checklists, deadlines and renewals; verified provider publication, course/session enrolment, progress, assessment, attendance, issuer-verifiable certificates and CPD ledger. Release evidence: one jurisdiction approved by qualified domain owners and a provider running real learning. Preserve historical pathway/credential versions.
4. **Commercial capability:** validated entitlements/plans, paid course/verification purchases as approved, checkout/invoices/refunds/tax, webhook idempotency and reconciliation, support disputes, organization subscriptions and partner payouts where the business model requires them. Release evidence: jurisdiction/pricing/refund/payment ownership agreed and reconciliation tested. No payment vendor or financial flow is silently selected.
5. **Clinical platform:** minimal encounter with patient/consent/facility/practitioner provenance, signed records and amendments, prescriptions versus dispensing, diagnostic orders/results, imaging references, surgery/anaesthesia/critical-care workflows, stock linkage and interoperability adapters. Release evidence: clinical governance, privacy boundaries, provenance, correction and pilot support approved. Owner notes never become verified clinical facts automatically.
6. **Growth and intelligence:** consented messaging, saved searches/favourites, governed reviews, education/library/events, referrals, native apps and partner commerce as validated. Outcome analytics require explicit metric definitions, safe cohorts and sufficient data. Epidemiology/AI require de-identification, source provenance, quality evaluation and professional oversight before activation.

Each increment needs a persona/outcome, permission policy, state model, data classification, operational owner and acceptance evidence. Extend existing modules where they own the concept; create learning/licensing/billing/clinical modules only with those contracts. The detailed [phased backlog](phased-backlog.md) remains the domain catalogue.

## Verification and launch distinction

Local checks cover API/browser journeys, concurrent proposal responses, identity recovery/revocation and background delivery failure handling. An isolated backup/restore drill on 2026-10-06 matched 36 tables, 13 schemas, 354 columns, 104 indexes and 19 migrations; a corrupted copy was rejected before restore. This proves the tested tooling, not a deployed backup schedule.

SMTP credentials, operational schedules, approved content, privileged MFA and clinical/payment rules are external launch dependencies. Local implementation is not commercial production sign-off. The current dependency audit retains a high-severity `deepmerge-ts` advisory through Prisma configuration; the offered automatic fix changes Prisma major version and was not forced. Resolve or formally assess before release.

Final local validation: web/API lint and production builds passed, 20 unit tests passed, all 49 API integration cases passed (including 15 isolated worker cases and 10 identity-security cases), and all 30 desktop/mobile browser cases passed in rate-limited batches. The real API-to-encrypted-queue-to-capture-transport verification/reset smoke passed, with old sessions rejected after reset. Current owner/professional/clinic/security screenshots were reviewed. Next.js was upgraded to 16.3.8 and related dependency patches were applied; the web production audit is clean. API audit reports three high-severity entries in the single Prisma/deepmerge configuration chain; development-only web lint dependencies also retain a separate advisory chain. No major-version forced fixes were applied.

The review preview uses web `http://localhost:3001`, API `http://localhost:4001`, and the dedicated local test PostgreSQL on port 55432. The local web `.env.local` selects that API. Real SMTP, production deployment and the existing shared development/production databases were not modified.
