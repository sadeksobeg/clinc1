# Observability and Alert Definitions (P6 Ready)

## Runtime Sources (currently live)
- `GET /api/internal/system/health`
- `GET /api/internal/system/queues`
- `GET /api/internal/system/failures`
- `GET /api/internal/system/errors`
- `GET /api/system/health/deep`

## One-Command Alert Check

Run:

`npm run ops:alerts:check`

This command evaluates live thresholds and exits with:
- `0` when no active alerts
- `1` when one or more alerts are firing

Script:
- `ops-dashboard/scripts/alerts-watchdog.cjs`

## Active Alert Rules (copy-paste thresholds)

- `system.db.down` (critical)
  - Condition: `health.db_ok = false`
  - Action: failover/restart DB path, pause writes if needed.

- `system.db.latency.high` (high)
  - Condition: `health.db_latency_ms > 800`
  - Action: inspect pool saturation and slow queries.

- `jobs.dead.present` (critical)
  - Condition: `queues.jobs_dead >= 1`
  - Action: inspect dead jobs, retry/cancel toxic jobs.

- `jobs.dead.spike24h` (high)
  - Condition: `failures.dead_jobs_24h >= 3`
  - Action: check runner health and idempotency regressions.

- `billing.webhook.failures.spike` (high)
  - Condition: `failures.webhook_failures_24h >= 5`
  - Action: verify webhook signature, endpoint health, replay safety.

- `billing.reminders.failures.spike` (medium)
  - Condition: `failures.reminder_failures_24h >= 3`
  - Action: inspect reminders worker token/network.

- `messaging.failures.spike` (high)
  - Condition: `failures.messaging_failures_24h >= 10`
  - Action: check bridge availability, queue backlog, policy rejects.

- `messaging.outbox.blocked` (high)
  - Condition: `queues.outbox_blocked >= 20`
  - Action: inspect policy gating, 24h window, kill switch settings.

- `events.dead_letter.spike` (high)
  - Condition: `queues.dead_letter_events >= 5`
  - Action: inspect event consumer and failing handlers.

- `errors.critical.occurrence_spike` (critical)
  - Condition: any critical fingerprint occurrences `>= 3`
  - Action: hotfix or isolate feature gate causing repeated critical error.

## Webhook Delivery (optional)
- Set `ALERT_WEBHOOK_URL` to receive alert payloads as JSON from watchdog.
- Existing deep-health path also emits webhook when dead-letter spike threshold is breached.

## Suggested Routing
- `critical`: pager + on-call channel
- `high`: on-call channel
- `medium`: ticket + daily review

