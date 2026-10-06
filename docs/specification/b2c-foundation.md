# B2C foundation: professionals and pet owners

The user expanded the product scope on 2026-09-30 to serve both veterinary professionals and pet owners. This document records the implemented first release, rather than bringing every planned Phase 2–5 capability forward.

## Implemented journeys

- Anonymous visitors see a public homepage and can browse verified, opted-in clinics.
- Registration creates a general account. New accounts are not automatically assigned a professional system role. Existing role assignments remain compatible; professional access is established through a professional profile, and privileged reviewer access still requires a governed system role.
- The workspace chooser offers professional or pet-owner onboarding. One account can maintain both profiles and organization memberships.
- Professionals continue using credentials, job applications, and portfolios. Public portfolio publication requires a current verified credential and does not require confirmed employment.
- Owners create a private contact profile, add/edit pets, and archive pets while retaining appointment history.
- Clinic owners/admins opt into appointment requests. Only verified clinic/hospital organizations with a city and phone can opt in. Opt-in publishes the selected directory fields, never verification evidence or private team/account records.
- Clinic owners/admins draft services, publish dated times and capacity, publish services, then switch from flexible requests to published times. Staff can read availability and manage appointments; catalogue management requires owner/admin access.
- An owner requests an appointment for a pet they control, selects a future time, and explicitly agrees to share the appointment details with the chosen clinic.
- Clinic owners/admins/staff confirm or decline requests, cancel confirmed appointments, or mark elapsed confirmed appointments completed. Recruiter membership alone grants no appointment access.
- Owners can cancel pending or confirmed appointments before check-in and request a change to a future confirmed time. Clinics accept or decline that request; owners can withdraw it.
- Clinic staff can record arrival within 24 hours before the visit or afterward. An elapsed confirmed visit without arrival can be marked no-show with a reason. Status history, audit, outbox, and notifications are preserved.

## Routes

| Route | Purpose |
|---|---|
| `/` | Public homepage when signed out; professional dashboard or pet-owner workspace according to the selected personal workspace |
| `/get-started` | Choose or add a personal workspace |
| `/professional` | Canonical professional workspace, independent of owner preference |
| `/applications` | Professional application journey |
| `/settings/security` | Contact verification, active devices, and sign-out controls |
| `/settings/security/mfa` | Authenticator enrollment, recovery codes and recent proof |
| `/settings/notifications` | Versioned optional-email preferences |
| `/forgot-password`, `/reset-password`, `/verify-email` | Explicit recovery and contact verification |
| `/owner/onboarding` | Create/update private owner contact details |
| `/owner` | Pets and appointment requests |
| `/clinics` | Public opted-in clinic directory and authenticated appointment request form |
| `/employer/appointments` | Clinic intake, services and availability, and appointment queue |

The scheduling API is under `/api/v1/scheduling`: public `GET clinics/:organizationId`, protected `GET/PATCH organizations/:organizationId`, owner/admin `POST/PATCH organizations/:organizationId/services` and `/slots` (item PATCH includes its ID), owner `POST clinics/:organizationId/holds` and `POST holds/:id/release`, and scoped `GET appointments/:id/alternatives`. List queries accept `serviceId` and `cursor`; alternatives pins the appointment service. The Next.js BFF exposes `/api/clinics/:id/availability`, `/api/clinics/:id/holds`, `/api/organizations/:id/schedule` with service/slot subroutes, `/api/appointments/holds/:id/release`, and `/api/appointments/:id/alternatives`, preserving session rotation and same-origin mutation guards.

## State and data rules

Appointment states are `REQUESTED → CONFIRMED | DECLINED | CANCELLED` and `CONFIRMED → COMPLETED | CANCELLED | NO_SHOW`. Arrival is a timestamp on a confirmed appointment. Terminal states cannot be reopened. Future visits cannot be completed or marked no-show; arrival prevents owner cancellation, time changes and no-show. Times are stored as UTC instants with an IANA time zone. Forms interpret the local input in the displayed zone and reject skipped or repeated daylight-saving times rather than guessing.

Requests still require clinic confirmation. In flexible mode, the owner requests a preferred time without reserving capacity. In published-time mode, the owner chooses a service and dated slot, obtains a five-minute hold and explicitly consents before submitting. Submission atomically consumes the hold and creates a `REQUESTED` appointment occupying that place; confirmation retains it. Cancellation, decline, completion and no-show cease to count against capacity. An expired or released hold cannot be submitted. Only one live temporary hold per owner is allowed; selecting another releases the previous temporary hold without changing a submitted appointment.

A clinic can propose a new time; the original request/confirmation stays intact until the owner explicitly accepts. An owner can request a new time for a future confirmed visit; the clinic must accept it. Scheduled visits can move only to another published time for the same service. A proposal does not reserve its destination: acceptance locks and rechecks capacity, then moves the appointment atomically. If the destination fills, the original appointment remains. One proposal can be active at a time. Proposals carry an initiator, a version and a response deadline before either visit time and at most seven days away. Rejection, withdrawal or expiry preserves the original time, while acceptance confirms the proposed time. Stale responses cannot overwrite a newer decision. Proposal actions appear in history, audit, outbox, and notifications.

Services have names, descriptions, durations of 5–240 minutes, publication state and optimistic versions. A service's duration becomes immutable after slots exist; changing it requires a new service. Slots are dated, timezone-aware, within 90 days, have 1–10 places and cannot overlap for the same service. Capacity cannot fall below active holds plus requested/confirmed visits. Times and service identity are immutable. Closing a time or unpublishing a service blocks new consumption and proposals, preserving existing appointment snapshots. Capacity applies per service time, not across practitioners, rooms or other services. Existing flexible requests are not automatically assigned places when the mode changes. Availability pages return at most 200 slots with a continuation cursor and no owner information; clinics can maintain up to 100 services.

Each request uses a client-generated UUID for idempotency. Repeated identical submissions return the same appointment; reuse with different content is rejected. Status changes use conditional database writes to prevent concurrent actors overwriting each other. Appointment creation and transitions atomically record history, audit, outbox, and in-app notifications.

The `owners` schema owns owner profiles and pet identities. The `appointments` schema owns services, slots, holds, request snapshots and history. Cross-module commands use public application interfaces. Snapshot fields preserve exactly the owner contact, pet name/species, clinic name, and scheduled service/duration shared at submission; changing a profile does not silently rewrite earlier requests. Consent is scoped to that request and is not authorization to access clinical records. Archiving a pet prevents new requests for it and preserves prior appointment history.

Employer candidate discovery includes only public professional profiles; private contact email is omitted from discovery. Expired credentials are excluded from publication eligibility, portfolio claims, and candidate discovery. A validity worker expires credentials after their inclusive UTC expiry date, and independent reviewers or authorized operations staff can revoke them with a private reason. The original verification decision is preserved.

## Setup and verification

Deploy the repository migrations to the intended development database with `npm run db:deploy`, then run web and API normally. Existing organizations default to appointment requests disabled. They must be verified through the reviewer workflow and explicitly enabled by an owner/admin in the appointment workspace. No clinic, owner, or reviewer identities are seeded by this release.

API integration tests use `TEST_DATABASE_URL` (default `vetlinx_test`). Run only against a disposable database. Browser tests likewise create test identities. The integration suites cover the existing career loop and owner/clinic authorization, consent, idempotency, transitions, retention, privacy, and account suspension.

The browser booking and scheduling journeys additionally require `B2C_TEST_DATABASE_URL` pointing to that same disposable API database. It creates unique clinic/owner accounts and marks only its clinic fixture verified through the database; production must use the reviewer workflow. Without that variable, the fixture-dependent tests are skipped. It never modifies an existing organization.

Refresh coordination shares rotations within a single web process and retains a short overlap window. Multiple web replicas require a shared coordination mechanism or a different session architecture before rollout.

## Remaining public-launch work

This foundation does not constitute commercial production sign-off. Recovery, contact verification, device revocation, authenticator MFA and assigned-reviewer evidence authorization are implemented. Existing release gates still apply, including enrollment of privileged accounts, approved terms/privacy content, evidence scanning, monitored database/evidence backups, operational support, and production traffic/rate-limit validation.

Email delivery and confirmed-appointment reminders are implemented through a separate worker. Email sends require a verified active account; in-app reminders remain available without verified email. Local capture is development-only; production requires SMTP and an encryption key. SMS, subscriptions, payments/refunds, licensing pathways, learning/CPD, branch/practitioner/resource calendars, recurring schedules, waitlists, pet ownership transfer, clinical records, and telemedicine remain later increments. The professional B2C offering currently consists of career identity, credentials, portfolio/CV, and job applications. See [implementation and roadmap](product-implementation.md) for dependencies and acceptance boundaries.
