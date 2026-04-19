# n8n core demotion (Phase 5)

## Goal

Keep n8n for **integrations and optional automation**, while the **critical path** (inbound WhatsApp → CRM → scheduling → reply policy) stays inside ops-dashboard internal APIs.

## Already in place

- **Unified ingest:** `POST /api/internal/conversations/process-inbound` (Bearer `SCHEDULING_SERVICE_TOKEN`).
- **Scheduling Engine JS** ([whatsapp-bridge/tools/scheduling-engine-n8n-code.js](../whatsapp-bridge/tools/scheduling-engine-n8n-code.js)) calls ops-dashboard `interpret` + `slots` with **`X-Correlation-Id`** derived from `message_id` / `dedupe_hash` when present.

## Recommended workflow changes

1. Point **CRM Upsert Inbound** (or equivalent) to `OPS_DASHBOARD_URL + /api/internal/conversations/process-inbound` with the same JSON shape you send today.
2. Remove duplicate SQL writes from n8n for tables owned by ops-dashboard (`messages`, `dialogue_state`, booking mutations) once the HTTP path is verified in staging.
3. Keep n8n nodes for: analytics webhooks, non-critical notifications, third-party SaaS, manual overrides.

## Rollout

- Run staging with **dual path** (n8n SQL + HTTP) only long enough to diff rows; then disable SQL side effects in n8n.
