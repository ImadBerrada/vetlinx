# Operations runbook

## Start and health

For local development, start PostgreSQL, deploy migrations, then start API and web. Confirm `/api/v1/health` reports both API and database up. In containers, use `compose.production.yaml`; the API applies committed migrations before boot.

For the selected Railway environment, use the [Railway deployment guide](railway-deployment.md) for service roots, private networking, persistent storage and production email configuration.

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

Build the API then run `npm run start:worker`. For a one-cycle check, run `npm --prefix apps/api run worker:once`; failure returns a nonzero exit code. Production compose starts a separate worker, requires SMTP settings and a stable `DELIVERY_ENCRYPTION_KEY`, and never permits capture mode. A deployment may explicitly use `MAIL_TRANSPORT=disabled` on API and worker: registration/sign-in and in-app events continue, new mail is not queued, eligible old mail is cancelled and purged, and email verification/password recovery report unavailability. The production encryption key remains required for MFA. Development capture files contain usable recovery links: keep API `var` private, never commit it, and remove old captures after use. Windows filesystem ACLs must restrict that directory; POSIX mode flags alone do not establish Windows ACLs.

The `/operations/delivery` workspace provides worker health, queue counts, oldest pending timestamps, and confirmed retries. `GET /api/v1/platform/delivery` requires an operations administrator/platform administrator session and returns the same redacted status. It exposes no recipients or message bodies. Alert if healthy is false, oldest pending age grows, or failed counts increase. Integration with an external alerting service remains a deployment task.

After correcting the underlying cause, use `POST /api/v1/platform/delivery/email/:id/retry` or `/event/:id/retry` as an authorized administrator. Retries only reopen failed jobs and are audited; expired recovery emails cannot be retried. Retry attempts are bounded to five with increasing backoff; expired worker leases recover after two minutes. Monitor duplicate external delivery risk during outages. Treat unsupported/version-mismatched pending outbox events separately from failed supported consumers.

Delivered/cancelled bodies are purged from the database. Failed encrypted bodies remain available for operator retry until a retention policy removes them; configure retention/expiry cleanup before public operation. Losing the encryption key makes queued bodies and authenticator secrets unreadable. Rotate keys with an explicit re-encryption procedure rather than overwriting the active key; draining mail alone does not migrate MFA secrets.

Account preferences at `/settings/notifications` govern optional appointment, reminder, and credential emails. The worker rechecks them before sending, including supported legacy queued messages. Disabled optional mail is cancelled and purged; in-app updates remain. Security and recovery mail cannot be disabled.

## Two-step verification and credential validity

Privileged accounts must enroll at `/settings/security/mfa` before using production review or delivery operations. Enrollment needs the current password and an authenticator code. Save the ten issued recovery codes outside the application; each is usable once and stored only as a hash. Login requires a second factor for every enrolled account. Production privileged actions additionally require proof within the previous 15 minutes; refresh does not renew this period. Password reset preserves MFA. No administrator bypass or silent enrollment reset is provided.

The worker invokes the Identity public interface to prune ephemeral MFA challenges and password-reset/email-verification tokens only after expiry plus a 24-hour technical grace. Each cycle removes at most 1,000 of each kind, oldest first, while preserving cooldown behavior and active links. This does not remove authenticator secrets, MFA recovery codes, device sessions or audit history; their governance policies are separate.

The delivery worker expires up to 100 due credentials per cycle, through the Credentials module. A date-based credential remains valid through its recorded UTC expiry date. Public eligibility checks exclude it after that date even before a worker cycle. The private wallet records expiry history; `/review/credentials` permits reasoned revocation by an assigned reviewer or operations administrator, excluding self-revocation. Revocation is terminal, removes current verified eligibility, and preserves the original review verdict and evidence. Renewal currently requires a new credential and governed review.

## Clinic scheduling

Clinic scheduling is opt-in at `/employer/appointments`: enable intake, add a draft service, publish dated times, publish the service, then select published-time requests. Capacity is per service time; operators must account for existing flexible appointments and shared staff/resources. Turning intake off blocks new holds and submissions without cancelling existing appointments. Switching to flexible mode preserves existing scheduled visits and their capacity. Closing times/unpublishing services blocks new bookings and new time-change acceptance into those times. Use explicit schedule refresh after a version/capacity conflict; forms preserve edits.

The worker invokes Appointments cleanup for at most 1,000 holds per cycle whose expiry is more than 24 hours old. This deletes temporary metadata, including consumed holds, while appointment request identifiers, service snapshots, history and audits remain. Capacity excludes expired holds immediately even when the worker is offline. Deploy `20261006140000_clinic_scheduling` before the scheduling API/worker/web; its fields are additive and existing organizations default to flexible mode. Individual practitioner assignments, recurring schedules and waitlists remain future capabilities.

Deploy additive migration `20261006150000_clinic_resources` before the resource-aware API/web. Owners/admins add named rooms, equipment or care-team labels in Services and availability, then select up to ten resources while publishing a time. Each resource is exclusive to that entire time block across services. Existing times get no automatic assignments. Closing a time preserves its reservations; select Release unused resources only after it is closed and has no active appointments or holds. Reopening rechecks all assigned resources. To retire a resource, release every upcoming reservation first; ongoing reservations require waiting for their interval to end. Staff can read the private schedule; owner/public availability omits resource names and assignment identifiers. Keep accounting for flexible appointments and individual practitioner eligibility, which are not covered by these resource labels.

## Monitoring

Alert on health failures, repeated 5xx responses, authentication throttling spikes, migration failure, backup failure, outbox backlog, disk/volume pressure, and evidence storage errors. Correlate HTTP requests, audit records, and outbox events using correlation IDs.

## Incident response

1. Contain affected sessions or service access.
2. Preserve logs/audit evidence; do not rewrite audit history.
3. Establish affected accounts, organizations, records, and time window.
4. Rotate compromised credentials/secrets and revoke sessions.
5. Restore only from a validated backup when data integrity is affected.
6. Document remediation and required regulatory/user notification.
