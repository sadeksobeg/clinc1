# ADR-002: Core backend choice for V2 (ClinicSaaS consolidation)

## Status

**Accepted (2026-04-19)** — execution decision for Core Backend V2 phases 2–4 is locked for the **current programme of work**. Long-term consolidation toward .NET remains the north star where it reduces duplicate domain logic.

## Options

| Option | Strengths | Risks |
|--------|-----------|--------|
| **A. Expand .NET (ClinicSaaS.Api)** | Billing, Identity, multi-tenant patterns already exist; strong typing; single deployable for “enterprise” features. | Team must absorb Node-only tooling (bridge) at the edge; Angular vs Next for ops UI. |
| **B. Expand Node (ops + new services)** | Aligns with whatsapp-bridge and n8n ecosystem; faster iteration for messaging. | Must port or sunset .NET billing/domain or accept two backends again. |

## Decision

1. **Long-term owner (north star): Option A — ClinicSaaS.Api** remains the intended **system of record** for billing, identity, and enterprise multi-tenant rules once consolidation is funded and sequenced.
2. **Interim owner for V2 messaging + scheduling brain (now): Option B — ops-dashboard (Node)** owns **`process-inbound`**, conversation dialogue state, transactional outbox rows consumed by an internal worker, and the thin n8n orchestration path. This avoids rewriting the same pipeline twice while n8n is reduced to webhook + HMAC + one HTTP hop.

## Consequences

- **New domain logic** for WhatsApp inbound (normalize → CRM upsert → interpret/slots → reply / handoff / alerts) lives in **ops-dashboard** until an explicit cutover migrates it to .NET behind stable HTTP contracts.
- **Money and long-lived PHI policies** should still prefer **ClinicSaaS.Api** when touching billing or regulated retention; ops-dashboard continues as **BFF + messaging core** for this phase.
- **Operational duplication** (.NET EF schema vs `whatsapp-bridge/sql` migrations) must be tracked per **ADR-001** when adding tables/columns (`dialogue_state`, `core_outbox`, etc.): apply the migration in the repo that owns the deployed Postgres for each environment, and avoid silent drift between stacks.
- **Cutover path:** when .NET absorbs `process-inbound`, preserve the same JSON contract and Bearer auth so n8n and the bridge require at most URL/env changes.
