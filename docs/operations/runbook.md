# Operations runbook

## Start and health

For local development, start PostgreSQL, deploy migrations, then start API and web. Confirm `/api/v1/health` reports both API and database up. In containers, use `compose.production.yaml`; the API applies committed migrations before boot.

## Database changes

1. Update `apps/api/prisma/schema.prisma`.
2. Create a named migration against a development database.
3. Inspect generated SQL, especially destructive statements and required fields.
4. Apply to `vetlinx_test` and run the full API journey.
5. Back up production, deploy the migration once, then deploy application containers.

Never use `prisma db push` for shared or production environments.

## Backup and recovery

Create a compressed backup from the local PostgreSQL container:

```powershell
.\scripts\backup-database.ps1 -Destination .\backups
```

Restoration is intentionally explicit and replaces current contents:

```powershell
.\scripts\restore-database.ps1 -Backup .\backups\vetlinx-YYYYMMDD-HHMMSS.dump -ConfirmRestore
```

Evidence files require a separate encrypted snapshot of the evidence volume. Database and evidence snapshots must share a recovery timestamp. Test restore procedures regularly; an untested backup is not a recovery plan.

Targets for the MVP pilot: daily database/evidence backups, 30-day retention, RPO 24 hours, RTO 4 hours. Tighten these targets before commercial production.

## Monitoring

Alert on health failures, repeated 5xx responses, authentication throttling spikes, migration failure, backup failure, outbox backlog, disk/volume pressure, and evidence storage errors. Correlate HTTP requests, audit records, and outbox events using correlation IDs.

## Incident response

1. Contain affected sessions or service access.
2. Preserve logs/audit evidence; do not rewrite audit history.
3. Establish affected accounts, organizations, records, and time window.
4. Rotate compromised credentials/secrets and revoke sessions.
5. Restore only from a validated backup when data integrity is affected.
6. Document remediation and required regulatory/user notification.

## Licensing pilot operations

### Deploy and seed a disposable pilot

1. Back up the database and evidence volume with the same recovery timestamp.
2. Run `npm run db:deploy`; do not use `prisma db push`.
3. On local or disposable pilot environments only, run `npm run db:seed:access`. The seed is idempotent, production-guarded, and creates a clearly labelled UAE pilot pathway without any authority-verified application result.
4. Start API and web, then run `npm --prefix apps/api run perf:licensing` and the full release verification.
5. Confirm the pathway source and version against `licensing-pilot-validation.md`. Seed success is not regulatory approval.

### Grant or revoke licensing roles

Use the audited role command with a reason:

```powershell
npm --prefix apps/api run role:manage -- grant curator@example.com LICENSING_CURATOR "UAE pilot content owner"
npm --prefix apps/api run role:manage -- grant reviewer@example.com LICENSING_REVIEWER "Independent UAE pilot review"
npm --prefix apps/api run role:manage -- revoke curator@example.com LICENSING_CURATOR "Pilot assignment ended"
```

Curators may draft and submit. Only licensing reviewers or platform administrators may publish or supersede. Revoke access immediately when assignment, employment, or incident containment requires it.

### Source review and pathway withdrawal

1. A curator compares every ordered requirement, source URL, and effective date with the represented authority's current publication.
2. Record findings and unresolved interpretation questions in `licensing-pilot-validation.md`.
3. Create a replacement version for changed requirements; never edit a published version.
4. A different qualified reviewer publishes the replacement and supersedes the prior version.
5. If content is unsafe or no longer supported, stop new use by withdrawing the governed version/pathway through the reviewer workflow. Preserve enrollments, audit history, and outbox history.

### Stale-content incident

Treat a broken source, changed rule, expired review date, or regulator correction as a content-integrity incident. Mark the pathway unsupported, prevent claims that readiness is current, notify the pathway owner and support owner, preserve evidence, and create a reviewed replacement. Do not silently rewrite pinned enrollments. Escalate possible unsafe professional-practice guidance to the represented authority or qualified regulatory advisor.

### Outbox recovery

Alert when pending licensing outbox records exceed the deployment threshold or oldest-event age. Stop the affected consumer, identify the last acknowledged event, and replay pending records using event ID idempotency. Never delete or mark an event processed merely to clear an alert. Correlate replay with audit records and verify `PathwayEnrollmentStarted`, `RequirementProgressChanged`, and pathway-version events downstream.

### Licensing rollback and restore

Application rollback uses the last known-good image. Database migrations are forward-remediated unless the reviewed migration explicitly supports reversal. If integrity requires restoration, stop writes, restore database and evidence snapshots from the same timestamp, verify row counts for pathways/versions/enrollments/outbox, rotate affected sessions, and rerun licensing journeys and performance checks before reopening. A restore does not recreate external authority decisions; user-reported applications remain labelled `USER_REPORTED`.
