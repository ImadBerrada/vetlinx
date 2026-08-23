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
