# WhatsApp: single source of truth (production decision)

## Decision (current engineering default)

**Primary patient messaging pipeline for clinic WhatsApp automation:** Node **whatsapp-bridge** → (optional **n8n** HMAC edge) → **ops-dashboard** `POST /api/internal/conversations/process-inbound` → Postgres CRM + scheduling FSM + bridge send / outbox.

Set explicitly in ops / bridge env (recommended): `OPS_WHATSAPP_PRIMARY_HANDLER=ops` so operators and automation know the active path without guessing.

This path owns interpretation (`interpretInboundText`), slots, dialogue state, and outbound logging documented in `docs/ENGINEERING_REPORT_N8N_ARCHITECTURE.md`.

## Parallel path: .NET `WhatsAppController`

`ClinicSaaS.Api` exposes `POST /api/whatsapp/incoming` with tenant webhook secret and `WhatsAppConversationService` state machine.

**Risk if both are active for the same tenant:** divergent replies, duplicate bookings, inconsistent conversation state.

## Recommended operational rule

1. Choose **one** inbound entry per tenant/environment:
   - **SaaS / ops-first:** bridge → n8n (or future thin HMAC service) → `process-inbound` only; disable or do not configure .NET WhatsApp webhook for that tenant.
   - **.NET-first (legacy):** route bridge to .NET only; do not call `process-inbound` for the same phone numbers.

2. Document the choice in tenant config / runbook (`docs/E2E_PRODUCTION_TEST_RUNBOOK.md`).

## Production freeze (72h launch sprint)

Use this freeze for launch:

- `OPS_WHATSAPP_PRIMARY_HANDLER=ops` in runtime env.
- Route WhatsApp inbound only to `ops-dashboard` (`/api/internal/conversations/process-inbound` via bridge/n8n edge).
- Do **not** register the same clinic number to .NET inbound in production.
- `.NET` `POST /api/whatsapp/incoming` now returns `409` when `OPS_WHATSAPP_PRIMARY_HANDLER=ops` to prevent dual-write drift.

## Reducing n8n in the critical path

Today n8n can be limited to **HMAC verification + HTTP proxy** to ops. To remove n8n entirely:

- Move HMAC verification into a small Node service (or extend whatsapp-bridge) and `POST` directly to `process-inbound` with `SCHEDULING_SERVICE_TOKEN`.

No change to core booking logic is required for that migration.
