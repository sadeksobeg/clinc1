# ClinicSaaS.Api (.NET) — frozen for daily operations

## Active production path

- **WhatsApp inbound:** `ops-dashboard` (`OPS_WHATSAPP_PRIMARY_HANDLER=ops`). This API returns **409** on `POST /api/whatsapp/incoming` when that env is set.
- **Clinic UI:** `apps/web` (BFF) → `ops-dashboard`.
- **CRM schema:** `whatsapp-bridge/sql/migrations` applied via ops scripts.

## Optional headless use

Run this API only if you still need **enterprise billing** endpoints not yet ported to ops (`/api/platform/billing/*`, subscription contracts). Do not expose it publicly except an allowlisted reverse-proxy path.

## Do not

- Register WhatsApp webhooks to this service in production.
- Apply EF migrations to the same Postgres database as the ops CRM without an explicit consolidation plan.

See [docs/ADR-001-single-source-of-truth-data-model.md](../../docs/ADR-001-single-source-of-truth-data-model.md).
