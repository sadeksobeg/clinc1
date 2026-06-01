# Observability stack

## Components

| Tool | Path | Purpose |
|------|------|---------|
| OpenTelemetry collector | `ops-observability/` | Traces from ops-dashboard / apps/web |
| Tempo | `ops-observability/tempo/` | Trace storage |
| Prometheus | bridge `GET /metrics`, ops health | Metrics |
| Structured logs | `request_traces`, `structured_logs` tables | SQL-backed audit |

## Enable on production

1. Set in `.env.prod`:
   - `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318`
   - `OTEL_SERVICE_NAME=ops-dashboard` (and clinic-web)
   - `SENTRY_DSN` (optional)
2. Run observability compose profile if split: `docker-compose.observability.yml`
3. Alert on:
   - `dead_letter_events` threshold (`DEAD_LETTER_ALERT_THRESHOLD`, `ALERT_WEBHOOK_URL`)
   - Bridge `/ready` != 200
   - `GET /api/system/health/deep` with `HEALTH_DEEP_TOKEN`

## Smoke

```bash
npm run smoke:observability
```
