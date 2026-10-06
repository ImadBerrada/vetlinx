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
- Clinic appointment mutations lock the verified clinic/hospital and owner/admin/staff membership inside the domain transaction, preventing a revoked grant from authorizing a later write.
- Clinic catalogue/mode changes require owner/admin membership and an exclusive organization-policy lock. Holds and submissions recheck current clinic intake and owner-controlled active pet under transaction locks. Published availability contains aggregate capacity and no owner details; slot locks and single-use holds enforce allocation independently of browser countdowns.
- Private evidence files are allowlisted by MIME/signature, size-limited, stored outside public assets, and returned only through authorized endpoints.
- Sensitive mutations generate append-only audit records and durable outbox events.
- Public portfolios expose only governed fields and reveal email only when the professional explicitly chooses public contact visibility.
- Production configuration rejects the development JWT secret.
- Authenticator-based two-step verification is optional for personal accounts and required for production reviewer, operations, and platform-admin routes. Privileged requests need a server-recorded verification within 15 minutes; token refresh does not extend that period.
- Password authentication for an enrolled account creates only a short-lived, hashed challenge. TOTP codes enforce counter replay protection; challenges and recovery codes are consumed once. Failed proofs share an account-level lockout across challenges.
- Enrollment requires password reauthentication and an authenticator proof. Secrets are authenticated-encrypted with a purpose-bound context; recovery codes are hashed and displayed only when issued. Password recovery preserves enrollment. Disabling MFA requires password and second-factor proof and signs out all devices.
- Optional appointment/reminder/credential email preferences are private and versioned. The worker rechecks preferences and current active, verified contact details before sending; mandatory account-security email remains enabled.

## Production requirements

- Terminate TLS at a trusted proxy and set `TRUST_PROXY=true` only when exactly one controlled proxy is in front of the API.
- Store secrets in the deployment platform’s secret manager; never commit production `.env` files.
- Replace in-memory throttling with shared Redis-backed storage before running multiple API replicas.
- Move evidence to encrypted private object storage with malware scanning, signed short-lived downloads, lifecycle policy, and regional residency controls.
- Centralize structured logs and alerts while redacting tokens, passwords, evidence, and clinical/identity payloads.
- Enroll every privileged account in MFA and store its recovery codes securely before production review operations. Configure the stable `DELIVERY_ENCRYPTION_KEY`; it also protects enrolled authenticator secrets. Key rotation requires a coordinated re-encryption procedure, rather than replacing the key on a running deployment.
- Complete jurisdiction-specific privacy, retention, and data-processing review before accepting real credentials.

## Data classes

| Class | Examples | Handling |
|---|---|---|
| Public | published name/headline, public organization name | Explicit publication only |
| Internal | workflow status, job drafts, aggregate IDs | Authenticated and scoped |
| Personal | email, identity profile, employment details | Least privilege, auditable access |
| Restricted evidence | degree/license files, reviewer decisions | Private storage, reviewer/owner access only |
| Secrets | passwords, JWT secret, refresh tokens | Hash/encrypt; never log or return after issuance |
