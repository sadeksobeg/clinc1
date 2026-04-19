# Clinic Pro — Gap analysis (post-implementation snapshot)

## Closed in this iteration

- Bridge modularization under `whatsapp-bridge/lib/` with `/health`, `/ready`, `/metrics`, reconnect backoff, webhook HMAC signing, optional `/send` bearer auth, outbound rate limits, optional night mute.
- CRM schema v2 multi-tenant in `whatsapp-bridge/sql/crm-bootstrap.sql` + upgrade path `sql/migrations/001_multitenant.sql`.
- n8n workflow: `clinic_id` propagation, multitenant CRM upsert, `workflow_latency_ms`, **Audit DLQ** path on CRM failure.
- Docker Compose skeleton: `docker-compose.clinic.yml`.
- Ops dashboard starter: `ops-dashboard/` (Next.js).
- AI adapter stub: `whatsapp-bridge/lib/ai/selfHosted.js`.
- Google Calendar stub + README.
- Runbook refresh + `npm test` for crypto signing.

## Remaining gaps (enterprise backlog)

- **RLS / tenant isolation in Postgres**: columns exist; row-level security and app-level `SET LOCAL` not enabled (would break n8n unless session vars set per execution).
- **HMAC verification inside n8n**: bridge signs outbound; n8n should validate before trusting body (add Function node at webhook entry).
- **Full RBAC staff UI**: ops dashboard is metrics-only; needs auth, conversation list, takeover, audit views.
- **Google Calendar OAuth implementation**: tokens per clinic, conflict detection — documented only.
- **Ollama in production**: model selection, GPU sizing, Arabic quality evaluation, timeouts in n8n parallel to rules path.
- **Central bridge orchestrator** for 20+ clinics: one process per WhatsApp session remains the practical model; needs process supervisor (PM2/K8s) outside this repo.
