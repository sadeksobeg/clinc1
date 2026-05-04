# ADR-001: Single source of truth for the CRM / scheduling schema

## Status

Accepted — launch freeze adopts `ops-dashboard + PostgreSQL` as production source-of-truth for inbound CRM/scheduling flows.

## Context

The repository currently contains:

- **PostgreSQL DDL** under `whatsapp-bridge/sql/` (bootstrap + migrations) used by n8n historically and by **ops-dashboard** (`pg`).
- **EF Core migrations** under `src/ClinicSaaS.Infrastructure` for the **ClinicSaaS.Api** modular monolith.

Using both against the **same** database without strict coordination risks drift, failed deploys, and silent incompatibility.

## Decision

1. **One database schema per environment** for production: either the ops path SQL **or** the EF path must own migrations; the other consumes via the same migration history or a **read-only** replica of the same logical model.
2. **Short term (implemented):** CRM **inbound upsert** that previously lived as raw SQL inside n8n is moved to **ops-dashboard** (`/api/internal/crm/inbound-ingest`) with **parameterized** queries, reducing SQL-in-n8n surface area while keeping one Postgres database for the ops stack.
3. **Launch freeze:** inbound decisions and writes are owned by the ops SQL path. `.NET` webhook inbound must be disabled when `OPS_WHATSAPP_PRIMARY_HANDLER=ops`.
4. **Medium term:** pick one migration owner permanently (EF or SQL) and retire the duplicate path.

## Consequences

- n8n workflows must call HTTP internal APIs for new CRM writes instead of embedding SQL strings.
- Deployments must document which service applies schema changes first.
