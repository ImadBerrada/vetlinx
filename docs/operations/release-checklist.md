# Release checklist

- [ ] Scope and acceptance criteria approved; no demo-only paths or seeded identities.
- [ ] Prisma migration reviewed and successfully applied to a production-like copy.
- [ ] Web lint/build and API lint/build/unit/integration suites pass.
- [ ] Browser journeys pass on desktop and mobile against a disposable database.
- [ ] Clinic pilot capacity matches available staff/resources; competing last-place holds, expired/duplicate submissions, catalogue permissions and reschedule-capacity conflicts pass. Existing flexible visits accounted for before enabling published times.
- [ ] `npm audit --omit=dev` has no unresolved production vulnerabilities.
- [ ] Authorization tested for owner, non-owner, reviewer, employer, and anonymous access.
- [ ] Privileged production accounts enrolled in MFA; recovery codes secured, step-up expiry and password-reset behavior verified.
- [ ] Worker running with a stable encryption key, queue monitoring, due credential expiry and retry ownership established.
- [ ] Logs contain no passwords, tokens, private evidence, or unnecessary personal data.
- [ ] JWT secret, database password, origins, proxy trust, and secure-cookie environment are correct.
- [ ] Backup completed and restore procedure last-tested date recorded.
- [ ] Health checks, error alerts, disk alerts, and outbox backlog alerts active.
- [ ] Public portfolio/privacy behavior manually reviewed.
- [ ] Rollback application image and forward database remediation plan documented.
- [ ] Product owner and engineering release owner sign off.
