# Design: Event outbox and stateless workers (V2)

## Goal

Guarantee **at-least-once processing** of inbound WhatsApp traffic from the bridge to business logic, with observable retries and dead-letter handling.

## Current incremental step (bridge)

The bridge now persists failed `POST` attempts to n8n in **`INBOUND_WEBHOOK_QUEUE_FILE`** (NDJSON) and drains them on the **heartbeat timer** (`flushInboundWebhookQueue` in `whatsapp-bridge/lib/waSession.js`), re-signing HMAC when configured.

## Target architecture

1. **Transactional outbox** in Postgres: `inbound_events` table written in the same transaction as idempotent message insert (or by Core Backend).
2. **Consumer workers** (stateless): poll or stream outbox rows with `SKIP LOCKED`, transition `pending → processing → done | dead`.
3. **Bridge** becomes **thin**: append-only event write + optional direct n8n trigger removed in favor of **Core ingest HTTP** or queue producer.

## Operational requirements

- Metrics: queue depth, age of oldest pending, DLQ rate.
- Dashboard: operator view of DLQ with replay and discard (future).
