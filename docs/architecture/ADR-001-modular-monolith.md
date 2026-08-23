# ADR-001: Microservice-ready modular monolith

- Status: Accepted
- Date: 2026-07-29

## Context

VetLinX has many long-term domains, but its first product loop requires professional identity, verification, recruitment, employment, and portfolio rules to evolve together. Deploying each domain independently now would add distributed transactions, retries, event ordering, service authentication, and operational overhead before the boundaries have been validated.

## Decision

Build the transactional MVP as one NestJS deployment composed of isolated domain modules.

Required constraints:

1. Every domain module owns its tables and migrations.
2. Direct cross-module database access is prohibited.
3. Synchronous collaboration uses exported application interfaces.
4. Asynchronous collaboration uses versioned events.
5. Events are written through a transactional outbox.
6. Consumers must be idempotent and tolerate duplicate delivery.
7. External systems are accessed through replaceable adapters.
8. Requests and events carry correlation and causation identifiers.
9. Circular module dependencies are prohibited.
10. Audit records are append-only from the application's perspective.

## Initial deployment

```text
Next.js web
    -> NestJS REST API
        -> PostgreSQL
        -> Redis workers
        -> S3-compatible storage
```

PostgreSQL may be a single cluster, but schemas and repository code remain module-owned.

## Likely extraction sequence

1. Notifications and document processing.
2. Search indexing.
3. Analytics ingestion and AI workloads.
4. Facility and clinical systems.
5. Payments and marketplace.
6. Recruitment when scale or team ownership requires it.

## Consequences

- MVP transactions and local development remain simple.
- Module boundaries must be enforced through code review and tests.
- Some extraction work remains, but business contracts and data ownership will already be defined.
- Distributed infrastructure is introduced only when it solves a demonstrated problem.

