# Observability and Alert Definitions

## Metrics Sources
- `GET /api/platform/metrics` for runtime API/auth/intelligence KPIs.
- `GET /api/platform/health/overview` for worker and dependency health.

## Alert Rules

### Auth Spike
- Condition: 401/403 responses > 5% over 5 minutes.
- Action: page on-call, inspect auth logs and token validation failures.

### Worker Down
- Condition: any worker heartbeat stale > 5 minutes.
- Action: restart worker host, inspect dead-letter queue growth.

### Database Latency
- Condition: API p95 latency > 800ms for 10 minutes.
- Action: inspect DB saturation, slow queries, connection pool.

### Webhook Delivery Failure
- Condition: dead-letter webhook count increases continuously for 10 minutes.
- Action: verify outbound webhook endpoint, credentials, and retries.

## Dashboard Panels
- API p95 latency
- Error rate %
- Auth success %
- Prediction accuracy %
- Action success %
- Ignored decisions %
- Dead-letter webhooks count

