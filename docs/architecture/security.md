# Security and privacy baseline

## Implemented controls

- Passwords use Argon2; plaintext credentials are never stored or logged.
- Short-lived JWT access tokens and rotating, hashed refresh sessions.
- Browser tokens reside in `HttpOnly`, `SameSite=Lax` cookies; secure cookies are enabled in production.
- Next.js mutations enforce same-origin browser requests; API CORS accepts only the configured frontend origin.
- Global DTO validation strips unknown input and rejects non-whitelisted properties.
- Helmet security headers on the API and explicit framing, MIME, referrer, and permissions headers on the web app.
- Global request throttling and tighter identity endpoint throttling.
- RBAC plus organization-scoped authorization for reviewer and employer operations.
- Private evidence files are allowlisted by MIME/signature, size-limited, stored outside public assets, and returned only through authorized endpoints.
- Sensitive mutations generate append-only audit records and durable outbox events.
- Public portfolios expose only governed fields and reveal email only when the professional explicitly chooses public contact visibility.
- Production configuration rejects the development JWT secret.

## Production requirements

- Terminate TLS at a trusted proxy and set `TRUST_PROXY=true` only when exactly one controlled proxy is in front of the API.
- Store secrets in the deployment platform’s secret manager; never commit production `.env` files.
- Replace in-memory throttling with shared Redis-backed storage before running multiple API replicas.
- Move evidence to encrypted private object storage with malware scanning, signed short-lived downloads, lifecycle policy, and regional residency controls.
- Centralize structured logs and alerts while redacting tokens, passwords, evidence, and clinical/identity payloads.
- Add MFA for reviewers/platform administrators before production review operations.
- Complete jurisdiction-specific privacy, retention, and data-processing review before accepting real credentials.

## Data classes

| Class | Examples | Handling |
|---|---|---|
| Public | published name/headline, public organization name | Explicit publication only |
| Internal | workflow status, job drafts, aggregate IDs | Authenticated and scoped |
| Personal | email, identity profile, employment details | Least privilege, auditable access |
| Restricted evidence | degree/license files, reviewer decisions | Private storage, reviewer/owner access only |
| Secrets | passwords, JWT secret, refresh tokens | Hash/encrypt; never log or return after issuance |
