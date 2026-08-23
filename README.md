# VetLinX MVP

VetLinX is a verified veterinary career platform. This repository implements the first closed economic loop: professional identity → evidence review → employer recruitment → accepted offer → organization-confirmed employment → strengthened professional portfolio.

## Delivered product surfaces

- Secure account registration, login, token rotation, logout, and protected BFF sessions.
- Professional onboarding, profile, privacy controls, verified portfolio, and ATS text CV.
- Credential wallet, private evidence upload, governed reviewer queue, and decisions.
- Organization onboarding, verification, invitations, and role-based membership.
- Structured jobs, verified-candidate discovery, applications, interviews, offers, and employment confirmation.
- Append-only audit history, durable outbox events, notifications, health checks, OpenAPI, and module manifest.
- Responsive veterinarian, employer, and reviewer workspaces with explicit empty/error/loading states.

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

## Container deployment

Create a deployment environment file with a URL-safe database password and a cryptographically random JWT secret of at least 32 characters. Then:

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
