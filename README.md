# VetLinX MVP

VetLinX connects veterinary professionals, pet owners, and verified organizations. The career workflow covers professional identity → evidence review → employer recruitment → accepted offer → organization-confirmed employment → strengthened professional portfolio. The B2C foundation adds private owner and pet profiles, a public opt-in clinic directory, and clinic-confirmed appointment requests.

## Delivered product surfaces

- Secure account registration, login, token rotation, logout, and protected BFF sessions.
- Email verification, password recovery, device sessions, and immediate session-family revocation.
- Professional onboarding, profile, privacy controls, verified portfolio, and ATS text CV.
- Credential wallet, private evidence upload, governed reviewer queue, and decisions.
- Organization onboarding, verification, invitations, and role-based membership.
- Structured jobs, verified-candidate discovery, applications, interviews, offers, and employment confirmation.
- Append-only audit history, durable outbox events, notifications, health checks, OpenAPI, and module manifest.
- Responsive veterinarian, employer, and reviewer workspaces with explicit empty/error/loading states.
- Public homepage and a workspace chooser; one account can have both professional and pet-owner profiles.
- Private pet-owner onboarding, pet creation/editing/archiving, appointment consent and request history.
- Verified clinics opt into public discovery and manage requests through owner/admin/staff permissions.
- Clinic time proposals with explicit owner acceptance, version checks, and an appointment timeline.
- Durable encrypted email delivery, retry controls, worker heartbeat, and confirmed-appointment reminders.

No demo identities are seeded. New users register through the product; privileged reviewer roles are granted through the audited role-management script.

## Architecture

The backend is a modular monolith with schema ownership and event contracts that preserve a low-friction path to microservices. Modules communicate through application interfaces and outbox events—not cross-module UI assumptions. See [ADR-001](docs/architecture/ADR-001-modular-monolith.md) and [module ownership](docs/architecture/module-ownership.md).

```text
src/                      Next.js web/BFF
apps/api/src/modules/     NestJS domain modules
apps/api/prisma/          PostgreSQL model and migrations
apps/api/test/            API integration journey
tests/e2e/                Browser journeys
docs/                     Engineering and operations specifications
scripts/                  Explicit backup/restore tooling
```

## Local setup

Requirements: Node.js 22+, npm, Docker Desktop, and Chrome.

```powershell
Copy-Item .env.example .env.local
Copy-Item apps/api/.env.example apps/api/.env
npm install
npm --prefix apps/api install
npm run db:up
npm run db:deploy
```

Run the API and web app in separate terminals:

```powershell
npm run dev:api
npm run dev:web
```

Build the API once (`npm run build:api`) and run `npm run start:worker` in another terminal for email and reminders. Local email is captured in the private API `var/mail` directory; no SMTP credentials are needed for development. Rebuild/restart the worker after backend changes.

- Web: `http://localhost:3000`
- Health: `http://localhost:4000/api/v1/health`
- API explorer: `http://localhost:4000/api/docs`
- OpenAPI JSON: `http://localhost:4000/api/openapi.json`

The project intentionally contains no shared login credentials. Register a normal account in the UI. To grant a reviewer role locally, run:

```powershell
npm --prefix apps/api run role:manage -- grant you@example.com REVIEWER "Local reviewer access"
```

## Verification

```powershell
npm run verify
npm run test:e2e
npm --prefix apps/api audit --omit=dev
```

The API integration suite uses `vetlinx_test`; set `DATABASE_URL` accordingly before invoking it directly. Browser tests create unique test accounts and should run only against a disposable database.

The worker integration suite scans whole queues and requires a separately migrated `vetlinx_worker_test` database through `WORKER_TEST_DATABASE_URL`; it refuses other database names and sends through a fake transport. Without that variable it is skipped. Browser tests retain real signup throttling: run each viewport project separately with a fresh minute between signup batches when testing through one local BFF address.

## Container deployment

Create a deployment environment file with a URL-safe database password, a cryptographically random JWT secret of at least 32 characters, `FRONTEND_ORIGIN`, `MAIL_FROM`, `SMTP_HOST`, SMTP connection/authentication settings, and a stable random 64-character hexadecimal `DELIVERY_ENCRYPTION_KEY`. Then:

```powershell
docker compose --env-file .env.production -f compose.production.yaml up --build -d
```

The API container applies committed migrations before starting. PostgreSQL and uploaded evidence use named volumes. Terminate without deleting volumes using `docker compose -f compose.production.yaml down`.

## Operations and specifications

- [Operations runbook](docs/operations/runbook.md)
- [Security baseline](docs/architecture/security.md)
- [RBAC matrix](docs/specification/rbac.md)
- [State transitions](docs/specification/state-transitions.md)
- [Event catalog](docs/specification/event-catalog.md)
- [Release checklist](docs/operations/release-checklist.md)
- [B2C scope, setup, and release boundaries](docs/specification/b2c-foundation.md)
- [Applied implementation and complete product roadmap](docs/specification/product-implementation.md)
