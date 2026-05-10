# ADR-001: Single source of truth for the CRM / scheduling schema

## Status

Accepted + Decision Locked (Launch) — `whatsapp-bridge/sql` is the only migration authority for launch environments; `ops-dashboard + PostgreSQL` remains production source-of-truth for inbound CRM/scheduling flows.

## Context

The repository currently contains:

- **PostgreSQL DDL** under `whatsapp-bridge/sql/` (bootstrap + migrations) used by n8n historically and by **ops-dashboard** (`pg`).
- **EF Core migrations** under `src/ClinicSaaS.Infrastructure` for the **ClinicSaaS.Api** modular monolith.

Using both against the **same** database without strict coordination risks drift, failed deploys, and silent incompatibility.

## Decision

1. **One database schema per environment** for production: either the ops path SQL **or** the EF path must own migrations; the other consumes via the same migration history or a **read-only** replica of the same logical model.
2. **Short term (implemented):** CRM **inbound upsert** that previously lived as raw SQL inside n8n is moved to **ops-dashboard** (`/api/internal/crm/inbound-ingest`) with **parameterized** queries, reducing SQL-in-n8n surface area while keeping one Postgres database for the ops stack.
3. **Launch freeze:** inbound decisions and writes are owned by the ops SQL path. `.NET` webhook inbound must be disabled when `OPS_WHATSAPP_PRIMARY_HANDLER=ops`.
4. **Decision locked for launch:** all schema changes on launch/staging environments must be applied from `whatsapp-bridge/sql/migrations` (or scripts that wrap that folder). EF migrations are reference-only during launch and must not be applied to launch/staging databases.
5. **Medium term (post-launch):** revisit whether EF should become the single long-term owner, but no dual-write migration ownership is allowed during launch.

## Consequences

- n8n workflows must call HTTP internal APIs for new CRM writes instead of embedding SQL strings.
- Deployments must document which service applies schema changes first.
- Release gates and runbooks must fail fast if migration source is ambiguous for a target environment.

## Enforcement (Launch Gate)

1. Production-like and launch environments must run schema updates from:
   - `whatsapp-bridge/sql/migrations/*.sql`
   - `ops-dashboard` migration scripts that execute those SQL files.
2. `src/ClinicSaaS.Infrastructure/Persistence/Migrations` stays available for design parity and future consolidation, but is blocked from launch DB apply flows.
3. Any PR changing both SQL migrations and EF migrations must include a parity note and explicit statement that SQL is the launch owner.
