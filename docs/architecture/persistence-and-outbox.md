# Persistence and outbox conventions

VetLinX uses one PostgreSQL cluster during the modular-monolith stage. Tables are separated into domain-owned PostgreSQL schemas:

- `identity`
- `professionals`
- `organizations`
- `audit`
- `platform`

This is a deployment convenience, not shared ownership. A domain module may query only its own tables through its repository. Cross-domain reads must use an exported application contract or a purpose-built read model.

## Migration ownership

Prisma generates one ordered migration stream while the API is one deployment. Every schema change must still identify its owning module in review. When a module is extracted, its PostgreSQL schema and repository become the starting boundary for the new service.

## Transactional outbox

Domain events are stored in `platform.outbox_events`. A later relay will publish pending rows to the chosen message broker and mark them as published. Consumers must remain idempotent because delivery is at least once.

For aggregate mutations, the aggregate write and outbox insert must be executed in the same Prisma transaction. Calling the event publisher after committing an aggregate is not sufficient. The first write-oriented module will introduce the transaction-scoped outbox writer before exposing its command endpoint.

## Audit events

The application treats `audit.audit_events` as append-only. Sensitive commands record the actor, action, resource, timestamp, correlation identifier, reason when required, and a structured description of changes. Audit payloads must not contain secrets or raw credential documents.
