# B2C foundation: professionals and pet owners

The user expanded the product scope on 2026-09-30 to serve both veterinary professionals and pet owners. This document records the implemented first release, rather than bringing every planned Phase 2–5 capability forward.

## Implemented journeys

- Anonymous visitors see a public homepage and can browse verified, opted-in clinics.
- Registration creates a general account. New accounts are not automatically assigned a professional system role. Existing role assignments remain compatible; professional access is established through a professional profile, and privileged reviewer access still requires a governed system role.
- The workspace chooser offers professional or pet-owner onboarding. One account can maintain both profiles and organization memberships.
- Professionals continue using credentials, job applications, and portfolios. Public portfolio publication requires a current verified credential and does not require confirmed employment.
- Owners create a private contact profile, add/edit pets, and archive pets while retaining appointment history.
- Clinic owners/admins opt into appointment requests. Only verified clinic/hospital organizations with a city and phone can opt in. Opt-in publishes the selected directory fields, never verification evidence or private team/account records.
- An owner requests an appointment for a pet they control, selects a future time, and explicitly agrees to share the appointment details with the chosen clinic.
- Clinic owners/admins/staff confirm or decline requests, cancel confirmed appointments, or mark elapsed confirmed appointments completed. Recruiter membership alone grants no appointment access.
- Owners can cancel pending or confirmed appointments. Status history, audit, outbox, and notifications are preserved.

## Routes

| Route | Purpose |
|---|---|
| `/` | Public homepage when signed out; professional dashboard or pet-owner workspace according to the selected personal workspace |
| `/get-started` | Choose or add a personal workspace |
| `/professional` | Canonical professional workspace, independent of owner preference |
| `/applications` | Professional application journey |
| `/settings/security` | Contact verification, active devices, and sign-out controls |
| `/forgot-password`, `/reset-password`, `/verify-email` | Explicit recovery and contact verification |
| `/owner/onboarding` | Create/update private owner contact details |
| `/owner` | Pets and appointment requests |
| `/clinics` | Public opted-in clinic directory and authenticated appointment request form |
| `/employer/appointments` | Clinic intake setting and appointment queue |

## State and data rules

Appointment states are `REQUESTED → CONFIRMED | DECLINED`, `CONFIRMED → COMPLETED | CANCELLED`, and owner cancellation from `REQUESTED`. Terminal states cannot be reopened. A future appointment cannot be completed, and an elapsed requested time cannot be confirmed. Times are stored as UTC instants with the owner's IANA time zone.

Requests are not instant bookings: there is no availability calendar or capacity reservation in this release. The clinic confirms the requested time. A clinic can propose a new time; the original request/confirmation stays intact until the owner explicitly accepts. Proposals carry a version and a response deadline. Rejection or expiry preserves the original time, while acceptance confirms the proposed time. Stale responses cannot overwrite a newer decision. Proposal actions appear in history, audit, outbox, and notifications.

Each request uses a client-generated UUID for idempotency. Repeated identical submissions return the same appointment; reuse with different content is rejected. Status changes use conditional database writes to prevent concurrent actors overwriting each other. Appointment creation and transitions atomically record history, audit, outbox, and in-app notifications.

The `owners` schema owns owner profiles and pet identities. The `appointments` schema owns request snapshots and history. Cross-module commands use public application interfaces. Snapshot fields preserve exactly the owner contact, pet name/species, and clinic name shared at submission; changing a profile does not silently rewrite earlier requests. Consent is scoped to that request and is not authorization to access clinical records. Archiving a pet prevents new requests for it and preserves prior appointment history.

Employer candidate discovery includes only public professional profiles; private contact email is omitted from discovery. Expired credentials are excluded from publication eligibility, portfolio claims, and candidate discovery. Full expiry/revocation operations remain a separate implementation item.

## Setup and verification

Deploy the new committed migration to the intended development database with `npm run db:deploy`, then run web and API normally. Existing organizations default to appointment requests disabled. They must be verified through the reviewer workflow and explicitly enabled by an owner/admin in the appointment workspace. No clinic, owner, or reviewer identities are seeded by this release.

API integration tests use `TEST_DATABASE_URL` (default `vetlinx_test`). Run only against a disposable database. Browser tests likewise create test identities. The integration suites cover the existing career loop and owner/clinic authorization, consent, idempotency, transitions, retention, privacy, and account suspension.

The browser booking journey additionally requires `B2C_TEST_DATABASE_URL` pointing to that same disposable API database. It creates unique clinic/owner accounts and marks only its clinic fixture verified through the database; production must use the reviewer workflow. Without that variable, the fixture-dependent booking test is skipped. It never modifies an existing organization.

Refresh coordination shares rotations within a single web process and retains a short overlap window. Multiple web replicas require a shared coordination mechanism or a different session architecture before rollout.

## Remaining public-launch work

This foundation does not constitute commercial production sign-off. Recovery, contact verification, device revocation, and assigned-reviewer evidence authorization are now implemented. Existing release gates still apply, including privileged MFA, approved terms/privacy content, evidence scanning, monitored database/evidence backups, operational support, and production traffic/rate-limit validation.

Email delivery and confirmed-appointment reminders are implemented through a separate worker. Email sends require a verified active account; in-app reminders remain available without verified email. Local capture is development-only; production requires SMTP and an encryption key. SMS, subscriptions, payments/refunds, licensing pathways, learning/CPD, facility schedules/capacity, pet ownership transfer, clinical records, and telemedicine remain later increments. The professional B2C offering currently consists of career identity, credentials, portfolio/CV, and job applications. See [implementation and roadmap](product-implementation.md) for dependencies and acceptance boundaries.
