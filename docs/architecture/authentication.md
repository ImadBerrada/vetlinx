# Authentication architecture

## Current decision

The MVP owns email/password authentication inside the `identity` module while keeping cryptography and token issuance behind replaceable services. This supports immediate development without coupling the professional domain to a particular external identity vendor.

## Passwords

Passwords are hashed with Argon2id using the OWASP baseline parameters:

- 19 MiB memory
- 2 iterations
- parallelism 1

Plaintext passwords and refresh tokens must never be logged, audited, or stored.

## Sessions

- Access tokens are signed JWTs with a 15-minute default lifetime.
- Refresh tokens are opaque 384-bit random values.
- Only SHA-256 refresh-token hashes are stored.
- Refresh tokens rotate on every use.
- Reuse of an already-rotated token revokes its active token family.
- Logout revokes the supplied refresh session.

Browser clients must not store access or refresh tokens in `localStorage` or `sessionStorage`. The frontend integration should use a same-origin Backend-for-Frontend or secure `HttpOnly`, `Secure`, `SameSite` cookies with CSRF protection. Native clients should use operating-system secure storage.

## Future identity-provider migration

Professional profiles reference an internal stable `accountId`, not an email address or provider-specific subject. A later OIDC provider can be introduced by mapping its subject to that account ID. The professional, recruitment, verification, and facility modules therefore do not need to change their identity keys.

Before production, replace the development JWT secret, add email ownership verification, account recovery, MFA readiness, login throttling, compromised-password controls, and production secret management.
