# Credentials foundation

## Boundary

The Credentials module owns credential facts and their lifecycle. It stores a stable `professionalProfileId` but has no ORM relation to the Professionals schema. Account ownership is resolved through `ProfessionalsPublicApi`, preserving the extraction boundary for a future credentials microservice.

## Current state machine

```text
DRAFT -> SUBMITTED
```

- `DRAFT` means the professional has created a self-declared credential record.
- `SUBMITTED` means the credential details have been submitted and the evidence workflow may begin.
- Repeating the submit command is idempotent and does not create duplicate audit or outbox events.
- `REVOKED` is reserved for a later governed transition and cannot currently be set through the public API.
- Expiry must be later than issue date when supplied.

Verification decisions are intentionally not stored on the credential. The Verification module will own review requests, evidence checks, reviewer assignments, confidence level, rejection, and verified status.

## HTTP contract

```text
GET  /api/v1/credentials/me
POST /api/v1/credentials/me
POST /api/v1/credentials/me/{credentialId}/submit
```

All endpoints require the authenticated account to own a professional profile.

## Events

```text
CredentialCreated v1
CredentialSubmitted v1
```

Events and their audit records are written in the same PostgreSQL transaction as the credential change. The outbox remains the extraction contract for later asynchronous consumers.

## Deliberately deferred

- Evidence file storage and malware scanning
- Verification requests and reviewer assignment
- Requests for additional information
- Verification confidence and source provenance
- Expiry monitoring and renewal
- Revocation decisions
