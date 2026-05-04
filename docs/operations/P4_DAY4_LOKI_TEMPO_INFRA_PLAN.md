# P4 Day 4 - Loki/Tempo Infra Deployment Blueprint

## Docker Baseline (Pilot)

Use:

- `docker-compose.prod.yml` for core app services.
- `docker-compose.observability.yml` for collector + Loki + Tempo + Grafana.

Bring up:

`docker compose -f docker-compose.prod.yml -f docker-compose.observability.yml up -d`

## Kubernetes Production Blueprint

Deploy as namespace `observability`:

1. `otel-collector` as `Deployment` with HPA.
2. `loki` as `StatefulSet` with PVC and retention policy.
3. `tempo` as `StatefulSet` with PVC and compaction.
4. `grafana` as `Deployment` with read-only provisioned data sources.

## Storage and Query Guardrails

- Storage class: SSD-backed block storage.
- Minimum IOPS target:
  - Loki: 3000+
  - Tempo: 3000+
- Retention:
  - Pilot: 7 days
  - Growth: 14 days
  - Enterprise: 30 days (with sampling and index guardrails)
- Query guardrails:
  - hard cap 24h query windows in dashboards.
  - required label filters (`service`, `env`, `clinic_id` where applicable).
