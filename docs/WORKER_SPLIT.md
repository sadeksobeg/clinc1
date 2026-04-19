# Worker split (Phase 4 — operational note)

The ops-dashboard remains a **BFF + API monolith** until traffic warrants separate deployables.

## Redis event stream

When `REDIS_URL` is set, `process-inbound` publishes `InboundMessageRecorded` to the stream named by `REDIS_EVENTS_STREAM` (default `ops:events:inbound`).

## Optional stub consumer

From `ops-dashboard`:

```bash
set REDIS_URL=redis://127.0.0.1:6379
npm run worker:event-consumer-stub
```

The stub reads the stream and logs payloads. Replace the handler with your worker process (e.g. BullMQ, separate Node service) without changing the publisher contract.

## Shared DB transactions

Until Booking is extracted, **keep transactional boundaries in Postgres** (`BEGIN`/`COMMIT` in the existing code paths). When splitting services, choose **one write owner per aggregate** (conversation vs appointment) and use outbox-per-service or idempotent consumers to avoid double effects.
