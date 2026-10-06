# Railway deployment

Target project: `192f4774-c2fb-4c31-b77e-99ad4851a620` (`unique-sparkle`).
Production environment: `69a7fbfd-cac9-4242-bf9f-747817ae9033`.
Public web domain: `https://web-production-c7d10.up.railway.app`.

## Services

| Service | Source root | Container command | Networking / storage |
| --- | --- | --- | --- |
| web | `/` | `node server.js` | Public HTTPS, port 3000; private API connection |
| api | `/apps/api` | `/usr/local/bin/vetlinx-entrypoint node dist/src/main.js` | Private port 4000; volume at `/app/var/evidence` |
| worker | `/apps/api` | `/usr/local/bin/vetlinx-entrypoint node dist/src/worker.js` | Private; shared PostgreSQL queue |
| Postgres | Railway PostgreSQL image | Image default | Private database; persistent database volume |

Web, API and worker use the Dockerfiles in their source roots. The API's
pre-deploy command is `npm run db:deploy`. Deploy the API before the worker on
the first release so the worker cannot start against an empty schema.
Health checks are `/` for web and `/api/v1/health` for API, with a 180-second
startup timeout. The worker is monitored through its database heartbeat and
the delivery operations workspace rather than an HTTP endpoint.

## Environment variables

Web:

- `NODE_ENV=production`, `PORT=3000`.
- `VETLINX_API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000`.
- `VETLINX_PUBLIC_ORIGIN=https://web-production-c7d10.up.railway.app` so
  browser mutation checks use the public HTTPS origin behind Railway's proxy.

API:

- `NODE_ENV=production`, `PORT=4000`, `ENABLE_API_DOCS=false`.
- `FRONTEND_ORIGIN=https://web-production-c7d10.up.railway.app`.
- `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
- `EVIDENCE_STORAGE_PATH=/app/var/evidence`, `RAILWAY_RUN_UID=0`.
- `TRUST_PROXY=false`: the API is reached through the web server privately.
- Independently generated `JWT_ACCESS_SECRET` and `DELIVERY_ENCRYPTION_KEY`.
- `MAIL_TRANSPORT=disabled`, as explicitly requested for this deployment.
  SMTP credentials are not required in this mode.

Worker:

- `NODE_ENV=production`, `MAIL_TRANSPORT=disabled`, `ENABLE_API_DOCS=false`.
- Same private PostgreSQL URL as API.
- Reference API's `JWT_ACCESS_SECRET`, `DELIVERY_ENCRYPTION_KEY`,
  `FRONTEND_ORIGIN`. Never generate a different
  encryption key for the worker.

Email is disabled: no new email jobs are created, existing eligible jobs are
cancelled with their bodies purged, and verification/recovery requests return
an explicit unavailable response. Registration, login, in-app notifications,
MFA and other worker tasks remain active. Unverified addresses remain
unverified; disabling email does not bypass account or credential checks.

To enable email later, configure SMTP values securely in Railway and set
`MAIL_TRANSPORT=smtp` on both API and worker; do not put credentials in this
document, repository, CLI output, or build arguments. Shared environment
variables need explicit `${{shared.VARIABLE_NAME}}` references on API; worker
can then reference `${{api.VARIABLE_NAME}}`. Port 465 uses `SMTP_SECURE=true`;
port 587 uses `SMTP_SECURE=false` with required STARTTLS.

Railway mounts volumes as root. The API container entrypoint initializes the
evidence directory when launched with `RAILWAY_RUN_UID=0`, then drops to the
unprivileged `node` user before running application commands. Existing files
are not recursively reassigned. Railway start-command overrides replace image
entrypoints, so the explicit API/worker commands above include the launcher.
Keep one API replica while using local private
file storage; use a shared storage adapter before horizontal scaling.

## Releases and verification

The CLI can upload the repository using `railway up --service SERVICE
--detach` from its root after linking the exact project and environment. Keep
`.gitignore` enabled; local environment files, backups and mail captures must
never be uploaded. A successful upload only starts a deployment: check its
final status, build/runtime logs and HTTP health before announcing it live.

GitHub autodeploys require the repository integration to have access to
`ImadBerrada/vetlinx`. Preserve service roots and separate API/worker commands
when connecting the repository. Source uploads are usable even when that
integration is unavailable.

Check the public landing page, professional and pet-owner registration/login
pages, public directory and protected-route behavior. Verify private API
database health, all committed migrations, worker heartbeat, and volume
permissions. Confirm disabled recovery reports an unavailable response and
creates no mail jobs. Before enabling email, test SMTP authentication/TLS
without sending unsolicited mail and complete verification/reset tests with
an authorized recipient.

Back up PostgreSQL and the evidence volume together, following the operations
runbook. Do not copy local test accounts into production. Production privileged
accounts need MFA enrollment; never deploy default administrator credentials.

## Costs

Paid Railway usage was explicitly approved for this deployment. This workspace
has an existing paid subscription; the deployment is not promised to be free.
Monitor Railway usage and agree on a workspace spending cap before changing
it: the workspace also contains other projects, so a hard cap can stop them.
