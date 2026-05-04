# P4 Day 3 - OTEL Instrumentation and Collector Topology

## Topology

- **Baseline (single node):**
  - `apps/web` + `ops-dashboard` export OTLP to one collector (`4318` HTTP).
  - Collector fan-out: traces -> Tempo, logs -> Loki.
- **Scale-out:**
  - 2+ collector replicas behind internal load balancer.
  - Sticky-free routing, batch + retry enabled at exporter level.

## Propagation Contract

- Required headers: `x-request-id`, `x-trace-id`, `x-clinic-id`, `x-user-id`.
- Map to OTEL attributes:
  - `http.request_id`
  - `midauto.trace_id`
  - `midauto.clinic_id`
  - `enduser.id`
- `job_id` and `entity_id` remain event attributes in logs/spans.

## Security and Retention Boundaries

- OTLP endpoints exposed on private network only.
- TLS termination at ingress/LB in production.
- Logs: 7-day default retention.
- Traces: 7-day default retention with 10% sampling for low-value endpoints.
