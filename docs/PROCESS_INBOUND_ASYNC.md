# `PROCESS_INBOUND_ASYNC` (Phase B — not enabled by default)

## Problem

Today `POST /api/internal/conversations/process-inbound` runs **full** CRM ingest + FSM + scheduling + persistence **before** the HTTP response returns. Redis stream publish is a side effect (`lib/events/redisPublish.ts`).

If an async flag later skips in-request booking **while** the synchronous path still runs the same logic, **double bookings and duplicate side effects** are guaranteed.

## Phase A (current)

- API remains the **only** executor of `processInboundMessage` booking/FSM work.
- `services/event-consumer` reads `InboundMessageRecorded`, writes `processed_events` (idempotency), fan-out logging/metrics hooks only — **no** `processInboundMessage` inside the consumer.

## Phase B (future guardrails)

1. **Single writer:** when `PROCESS_INBOUND_ASYNC=true`, the API must **stop** executing the booking-critical section (or short-circuit after validation + `crmUpsertInbound` + event publish). The consumer becomes the sole executor of that section.
2. **Feature flag + rollout:** default `false`; enable per environment only after parity tests pass.
3. **Parity tests:** same inputs produce identical DB rows and outbound intents vs synchronous baseline (golden fixtures + load replay).
4. **Idempotency:** keep `event_id` on `InboundMessageRecorded` and `processed_events`; consumer must tolerate at-least-once delivery.
5. **Errors:** classify terminal vs retry (`ops-dashboard/lib/errors/eventErrors.ts`; consumer: `services/event-consumer/src/classifyError.js`) so poison payloads do not retry forever.
6. **Failure UX:** define behavior when async pipeline fails (DLQ, patient-facing fallback, manual replay) — do not silently drop bookings.
7. **Operational replay:** `db:replay-events` today does **not** re-drive FSM; a real replay engine is required before promising recovery from stream alone.

Do **not** set `PROCESS_INBOUND_ASYNC` in production until the above is implemented and tested.
