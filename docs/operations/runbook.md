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

Scripts accept explicit `-Container`, `-Database`, and `-DatabaseUser` parameters. Each backup validates the custom archive and writes a checksum/size/target manifest beside it. Restore checks an available manifest before opening its transaction; `--single-transaction --exit-on-error` prevents a partial database replacement. Use a separate database for restore drills. A manifest is an integrity check, not a signed authenticity guarantee.

Restoration is intentionally explicit and replaces current contents:

```powershell
.\scripts\restore-database.ps1 -Backup .\backups\vetlinx-YYYYMMDD-HHMMSS.dump -ConfirmRestore
```

Evidence files require a separate encrypted snapshot of the evidence volume. Database and evidence snapshots must share a recovery timestamp. Test restore procedures regularly; an untested backup is not a recovery plan.

Targets for the MVP pilot: daily database/evidence backups, 30-day retention, RPO 24 hours, RTO 4 hours. Tighten these targets before commercial production.

## Delivery worker and recovery

Build the API then run `npm run start:worker`. For a one-cycle check, run `npm --prefix apps/api run worker:once`; failure returns a nonzero exit code. Production compose starts a separate worker, requires SMTP settings and a stable `DELIVERY_ENCRYPTION_KEY`, and never permits capture mode. Development capture files contain usable recovery links: keep API `var` private, never commit it, and remove old captures after use. Windows filesystem ACLs must restrict that directory; POSIX mode flags alone do not establish Windows ACLs.

`GET /api/v1/platform/delivery` requires an operations administrator/platform administrator session and returns heartbeat freshness, queue counts and redacted failed IDs. It exposes no recipients or message bodies. Alert if healthy is false, oldest pending age grows, or failed counts increase. Integration with an external alerting service remains a deployment task.

After correcting the underlying cause, use `POST /api/v1/platform/delivery/email/:id/retry` or `/event/:id/retry` as an authorized administrator. Retries only reopen failed jobs and are audited; expired recovery emails cannot be retried. Retry attempts are bounded to five with increasing backoff; expired worker leases recover after two minutes. Monitor duplicate external delivery risk during outages. Treat unsupported/version-mismatched pending outbox events separately from failed supported consumers.

Delivered/cancelled bodies are purged from the database. Failed encrypted bodies remain available for operator retry until a retention policy removes them; configure retention/expiry cleanup before public operation. Losing the encryption key makes queued bodies unreadable. Rotate keys with an explicit re-encryption/drain procedure rather than overwriting the active key.

## Monitoring

Alert on health failures, repeated 5xx responses, authentication throttling spikes, migration failure, backup failure, outbox backlog, disk/volume pressure, and evidence storage errors. Correlate HTTP requests, audit records, and outbox events using correlation IDs.

## Incident response

1. Contain affected sessions or service access.
2. Preserve logs/audit evidence; do not rewrite audit history.
3. Establish affected accounts, organizations, records, and time window.
4. Rotate compromised credentials/secrets and revoke sessions.
5. Restore only from a validated backup when data integrity is affected.
6. Document remediation and required regulatory/user notification.
