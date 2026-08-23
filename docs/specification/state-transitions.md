# State transition rules

All transitions are checked server-side and written with audit/outbox records in the same database transaction where the workflow requires atomicity.

## Credential and verification

```text
Credential: DRAFT → SUBMITTED → VERIFIED | REJECTED
Verification: DRAFT → SUBMITTED → UNDER_REVIEW → VERIFIED | NEEDS_INFORMATION | REJECTED
NEEDS_INFORMATION → SUBMITTED
VERIFIED → EXPIRED | REVOKED
```

Evidence must exist before a verification request can be submitted. Decisions require the reviewer role and an under-review request. Verified claims are never silently rewritten back to draft.

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
