# Release checklist

- [ ] Scope and acceptance criteria approved; no demo-only paths or seeded identities.
- [ ] Prisma migration reviewed and successfully applied to a production-like copy.
- [ ] Web lint/build and API lint/build/unit/integration suites pass.
- [ ] Browser journeys pass on desktop and mobile against a disposable database.
- [ ] `npm audit --omit=dev` has no unresolved production vulnerabilities.
- [ ] Authorization tested for owner, non-owner, reviewer, employer, and anonymous access.
- [ ] Logs contain no passwords, tokens, private evidence, or unnecessary personal data.
- [ ] JWT secret, database password, origins, proxy trust, and secure-cookie environment are correct.
- [ ] Backup completed and restore procedure last-tested date recorded.
- [ ] Health checks, error alerts, disk alerts, and outbox backlog alerts active.
- [ ] Public portfolio/privacy behavior manually reviewed.
- [ ] Rollback application image and forward database remediation plan documented.
- [ ] Product owner and engineering release owner sign off.
