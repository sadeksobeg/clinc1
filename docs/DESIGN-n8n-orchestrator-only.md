# Design: n8n as orchestrator only (target state)

## Current state (after this iteration)

- **Reduced:** `CRM Upsert Inbound` is no longer a Postgres node; it calls **ops-dashboard** internal HTTP.
- **Still in n8n:** SQL nodes for alerts, cases, conversation state, outbound message log, audit DLQ; scheduling still invoked from a Code node.

## Target state

- **n8n** wires **integrations** (calendar, email, marketing tools) and **human-in-the-loop** approvals.
- **Core Backend** (see ADR-002) owns: conversation state machine, booking, CRM mutations, AI policy, notification templates.
- **n8n** subscribes to **domain events** (`AppointmentConfirmed`, `NoShowMarked`) via signed webhooks or queue consumers — **no embedded business SQL**.

## Migration hints

1. Move each remaining Postgres node to a Core endpoint with the same auth pattern as `/api/internal/crm/inbound-ingest`.
2. Replace the **Scheduling Engine** Code node with a single Core `POST /conversations/:id/process` (example) that returns `finalReply` + side effects.
3. Keep n8n for long-tail integrations where a visual editor beats bespoke code.
