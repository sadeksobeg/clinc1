# ADR-001: Single source of truth for the CRM / scheduling schema

## Status

Accepted (directional) — **implementation in progress**; this ADR records the decision to converge.

## Context

The repository currently contains:

- **PostgreSQL DDL** under `whatsapp-bridge/sql/` (bootstrap + migrations) used by n8n historically and by **ops-dashboard** (`pg`).
- **EF Core migrations** under `src/ClinicSaaS.Infrastructure` for the **ClinicSaaS.Api** modular monolith.

Using both against the **same** database without strict coordination risks drift, failed deploys, and silent incompatibility.

## Decision

1. **One database schema per environment** for production: either the ops path SQL **or** the EF path must own migrations; the other consumes via the same migration history or a **read-only** replica of the same logical model.
2. **Short term (implemented in this iteration):** CRM **inbound upsert** that previously lived as raw SQL inside n8n is moved to **ops-dashboard** (`/api/internal/crm/inbound-ingest`) with **parameterized** queries, reducing SQL-in-n8n surface area while keeping one Postgres database for the ops stack.
3. **Medium term:** Pick **one** migration owner (recommended: **EF Core** if ClinicSaaS.Api is the commercial core, or **SQL** if ops-first). Generate the other from exports or retire the duplicate product path.

## Consequences

- n8n workflows must call HTTP internal APIs for new CRM writes instead of embedding SQL strings.
- Deployments must document which service applies schema changes first.
