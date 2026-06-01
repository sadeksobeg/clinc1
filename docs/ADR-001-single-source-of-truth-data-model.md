# ADR-001: Single source of truth for the CRM / scheduling schema

## Status

Accepted + Decision Locked (Launch) — `whatsapp-bridge/sql` is the only migration authority for launch environments; `ops-dashboard + PostgreSQL` remains production source-of-truth for inbound CRM/scheduling flows.

**2026-06 update (Option A):** Clinic UI and WhatsApp operations use **ops-dashboard + apps/web** only. **Angular (`frontend/ClinicSaaS.Web`) is deprecated.** **ClinicSaaS.Api (.NET)** is frozen for daily ops; optional **headless** use for enterprise billing until migrated to ops local billing.

## Context

The repository currently contains:

- **PostgreSQL DDL** under `whatsapp-bridge/sql/` (bootstrap + migrations) used by n8n historically and by **ops-dashboard** (`pg`).
- **EF Core migrations** under `src/ClinicSaaS.Infrastructure` for the **ClinicSaaS.Api** modular monolith.

Using both against the **same** database without strict coordination risks drift, failed deploys, and silent incompatibility.

## Decision

1. **One database schema per environment** for production CRM: **ops path SQL** owns migrations; apply via `ops-dashboard` scripts (`npm run db:apply-scheduling`, `npm run db:apply-phase1`).
2. **Inbound / scheduling / UI:** ops CRM only. Set `OPS_WHATSAPP_PRIMARY_HANDLER=ops`. Bridge/n8n call `POST /api/internal/conversations/process-inbound` only.
3. **`.NET` webhook inbound** returns `409` when `OPS_WHATSAPP_PRIMARY_HANDLER=ops` ([`WhatsAppController.cs`](../src/ClinicSaaS.Api/Controllers/WhatsAppController.cs)).
4. **EF migrations** must not be applied to launch/staging CRM databases. Use `clinic_saas_tenant_links` to map `clinic_id` ↔ .NET `tenant_guid` when billing bridge is needed.
5. **apps/web billing BFF** uses ops `/api/internal/billing/*` (not .NET) unless `DOTNET_API_URL` is explicitly re-enabled for enterprise features.

## Consequences

- n8n workflows call HTTP internal APIs for CRM writes instead of embedding SQL strings.
- Angular and .NET UIs are not deployed for new features.
- Deployments document `OPS_WHATSAPP_PRIMARY_HANDLER=ops` and run `production-env-audit.mjs` before go-live.

## Enforcement (Launch Gate)

1. Production-like environments run schema updates from `whatsapp-bridge/sql/migrations/*.sql`.
2. `SUPERADMIN_IP_ALLOWLIST_DISABLED` is forbidden in production (code + audit script).
3. E2E/smoke covers login, appointments API, and optional `process-inbound` smoke (`scripts/e2e-booking-inbound-smoke.cjs`).
