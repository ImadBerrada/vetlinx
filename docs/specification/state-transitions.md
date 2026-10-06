# State transition rules

All transitions are checked server-side and written with audit/outbox records in the same database transaction where the workflow requires atomicity.

## Credential and verification

```text
Credential: DRAFT → SUBMITTED → VERIFIED | REJECTED
Credential: VERIFIED → EXPIRED | REVOKED; EXPIRED → REVOKED
Verification: DRAFT → SUBMITTED → UNDER_REVIEW → VERIFIED | NEEDS_INFORMATION | REJECTED
NEEDS_INFORMATION → SUBMITTED
```

Evidence must exist before a verification request can be submitted. Decisions require the assigned reviewer and an under-review request. Credential expiry/revocation records a separate validity history while preserving the original verification decision. Revocation requires an independent authorized actor and a specific reason. An expiry date is inclusive through that UTC date. Verified claims are never silently rewritten back to draft; renewal creates a new credential and review.

## Organization verification

```text
DRAFT → SUBMITTED → UNDER_REVIEW → VERIFIED | NEEDS_INFORMATION | REJECTED
NEEDS_INFORMATION → SUBMITTED
VERIFIED → SUSPENDED
```

Only a verified organization may publish jobs, search verified candidates, send offers, or confirm employment.

## Job and application

```text
Job: DRAFT → PUBLISHED → CLOSED
Application: SUBMITTED → UNDER_REVIEW → SHORTLISTED → INTERVIEWING → OFFERED → HIRED
SUBMITTED | UNDER_REVIEW | SHORTLISTED | INTERVIEWING → REJECTED
SUBMITTED → WITHDRAWN
```

A professional cannot apply to their own organization or apply twice to the same job. Closed/unpublished jobs reject new applications.

## Interview and offer

```text
Interview: SCHEDULED → COMPLETED | CANCELLED
Offer: DRAFT → SENT → ACCEPTED | DECLINED | WITHDRAWN | EXPIRED
```

Candidate responses are accepted only for sent, non-expired offers. Accepted, declined, withdrawn, and expired offers are terminal.

## Employment

```text
Accepted offer → CONFIRMED
CONFIRMED → ACTIVE when start date has arrived
CONFIRMED → CANCELLED before activation
ACTIVE → ENDED with a valid end date
```

Only the organization tied to the accepted offer can confirm employment. Confirmation atomically marks the application hired and publishes portfolio-update events.

## Owner/clinic appointment requests

```text
REQUESTED → CONFIRMED | DECLINED | CANCELLED
CONFIRMED → COMPLETED | CANCELLED | NO_SHOW
Arrival: unrecorded → checked in (while CONFIRMED)
Clinic time proposal: pending → owner accepted | rejected | expired | cleared on cancellation
Owner reschedule request: pending → clinic accepted | declined | owner withdrawn | expired | cleared on cancellation
```

Only the requesting owner can accept/reject a clinic's versioned proposal. Only authorized clinic staff can answer an owner reschedule request, and only the owner can withdraw it. Owner requests require a future confirmed visit, a future proposed time, a reason and a deadline within seven days and before both times. There is one active proposal; opposite-origin changes must be answered before another can be proposed. Acceptance confirms the proposed time; rejection, withdrawal and expiry preserve the original status/time.

Confirmation, completion, arrival and no-show cannot bypass a live proposal. Arrival can be recorded within 24 hours before a confirmed visit or afterward. No-show requires an elapsed visit, no arrival and a reason. Arrival blocks owner cancellation and time changes. Terminal appointments cannot reopen, future visits cannot be completed, and stale versions cannot overwrite newer actions. Exact retries of new care commands return the existing result only while the corresponding decision is still current. Every decision retains the request snapshot and appends history/audit/outbox/notifications atomically. Clinic permission is held through transaction commit by organization/member shared locks.

Times are UTC instants plus an IANA timezone. Flexible requests do not reserve capacity; scheduled requests do. Local form values are interpreted in the displayed zone; skipped or repeated daylight-saving times require another unambiguous input. API timestamps must include a UTC or numeric offset.

```text
Service: DRAFT ↔ PUBLISHED (optimistic version)
Slot: PUBLISHED ↔ CLOSED (optimistic version; capacity cannot undercut occupancy)
Hold: LIVE → CONSUMED | RELEASED | EXPIRED
Consumed hold → REQUESTED appointment (atomic)
Scheduled reschedule acceptance: original slot → another published slot of the same service (atomic capacity check)
```

Hold expiry is determined from the current database-backed deadline, independent of worker uptime; the UI countdown is advisory. Holds last at most five minutes and end before their slot starts. Competing owners lock the slot before capacity checks, and one owner may have only one live temporary hold. Identical hold/submission retries preserve the original deadline/result. Published-time mode rejects requests without holds. Catalogue publication and intake changes acquire organization-policy locks before slot writes. Closing/unpublishing blocks new bookings while preserving earlier appointment snapshots. A reschedule proposal does not occupy its destination; failed acceptance leaves the original appointment and capacity intact. Bounded worker cleanup after a 24-hour grace removes ephemeral holds while appointments retain the consumed request identifier.

## Account security and delivery

Recovery/verification tokens are purpose-bound, unused and unexpired before consumption. Password reset invalidates every session family and older access-token versions. A device logout revokes its entire family including rotated descendants; other families remain active.

Enrolled account login: password accepted → hashed challenge → second-factor proof → session. The challenge expires after five minutes, has bounded attempts and is consumed once. TOTP counters and recovery codes cannot be replayed. Password reset preserves enrollment; MFA disable requires password plus proof and revokes all sessions. Privileged production routes require recent second-factor proof, recorded on the server-side session family.

```text
Delivery: PENDING → PROCESSING → DELIVERED | PENDING (backoff) | FAILED
PROCESSING → CANCELLED when an email expires, its reminder becomes stale, or optional delivery becomes ineligible
Expired lease: PROCESSING → PROCESSING under a new worker lease
Administrator recovery: FAILED → PENDING (audited, eligible unexpired content only)
```

Delivered/cancelled email bodies are purged. SMTP delivery may repeat after an acknowledgement failure; it is not exactly-once.

## Shared clinic resources

```text
Resource: AVAILABLE ↔ RETIRED (optimistic version)
Slot reservation: RESERVED → RELEASED (closed, future, no active holds or appointments)
Reopening: RELEASED → RESERVED (all assigned resources active and non-overlapping)
```

A resource reserves the entire time block across services, including every place in that block. Slots keep fixed resource assignments, start and end instants. Closing a slot or unpublishing its service does not release resources. Requested/confirmed appointments and unexpired active holds prevent release. Retirement is blocked by upcoming or ongoing reservations, including closed slots whose resources have not been released. A failed release, reopening or audit leaves the prior reservation intact. Existing resource-free slots retain their original behavior.

## Phase 2 — Licence pathways

```text
Pathway version: DRAFT → IN_REVIEW → PUBLISHED → SUPERSEDED | WITHDRAWN
Pathway enrollment: ACTIVE → SUBMITTED_EXTERNALLY → APPROVED | REJECTED | WITHDRAWN
Requirement progress: MISSING → IN_PROGRESS → SATISFIED | NEEDS_REVIEW | NOT_APPLICABLE
NEEDS_REVIEW → SATISFIED | MISSING
Professional licence: ACTIVE → EXPIRING → RENEWED | EXPIRED | REVOKED
```

Published pathway versions are immutable. A professional enrollment pins the published version selected at enrollment time. Automatic evidence evaluation may propose `NEEDS_REVIEW` but cannot establish governed satisfaction where verification is required.

## Phase 2 — Learning products and enrollment

```text
Learning product version: DRAFT → IN_REVIEW → PUBLISHED → UNPUBLISHED | SUPERSEDED
Enrollment: ENROLLED → IN_PROGRESS → COMPLETED | WITHDRAWN | EXPIRED
Attendance: UNRECORDED → PRESENT | PARTIAL | ABSENT
Assessment attempt: STARTED → SUBMITTED → PASSED | FAILED | VOIDED
Certificate: ISSUED → REVOKED
CPD record: PENDING → CONFIRMED → REVOKED
```

Product publication requires an authorized verified provider and content review. Enrollment pins the published version. Completion is computed from versioned completion rules. Certificates issue only after every mandatory condition passes. Attendance corrections and certificate revocation preserve prior state, actor, reason, and audit history.
