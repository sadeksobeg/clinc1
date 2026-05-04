# P4 Day 5 - Sentry Integration and Alert Rules

## SDK Placement

- `apps/web`: capture unhandled frontend errors and API route exceptions.
- `ops-dashboard`: capture API and job-runtime exceptions.

## Enrichment Contract

Standard tags for all events:

- `clinic_id`
- `route`
- `trace_id`
- `job_type`
- `request_id`

Standard extra context:

- `entity_id`
- `user_id`
- `billing_status`

## Alert Rules (High Value)

1. Billing failures spike:
   - condition: `event.type:error` and route contains `billing` over baseline x3.
2. Dead jobs spike:
   - condition: message contains `failed_dead` more than 5 within 10 minutes.
3. SLA breach signal delay:
   - condition: support SLA processing errors > 3 in 15 minutes.
4. Timeline ingest failures:
   - condition: errors in `internal/observability/trace` endpoint > 5 in 5 minutes.

## Routing

- Critical -> Pager/ops on-call.
- High -> Slack + email.
- Medium -> Slack only.
