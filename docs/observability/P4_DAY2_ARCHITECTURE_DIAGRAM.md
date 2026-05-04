# P4 Day 2 - Hybrid Observability Architecture

```mermaid
flowchart LR
  subgraph app[Apps]
    web[apps/web]
    ops[ops-dashboard]
    jobs[system-jobs runners]
  end

  subgraph contract[Correlation Contract]
    hdr[x-request-id + x-trace-id + x-clinic-id + x-user-id]
    timeline[internal timeline API]
  end

  subgraph otel[Telemetry Transport]
    sdk[OTEL SDK instrumentation]
    collector[OTEL Collector]
  end

  subgraph selfhost[Self-hosted Observability]
    loki[Loki]
    tempo[Tempo]
    grafana[Grafana]
  end

  subgraph managed[Managed Critical Hooks]
    sentry[Sentry]
  end

  web --> hdr
  ops --> hdr
  jobs --> hdr
  hdr --> timeline

  web --> sdk
  ops --> sdk
  jobs --> sdk
  sdk --> collector
  collector --> tempo
  collector --> loki

  ops --> sentry
  web --> sentry

  timeline --> grafana
  loki --> grafana
  tempo --> grafana
  sentry --> grafana

  collector -. exporter failure .-> timeline
  collector -. retry/backoff .-> collector
  jobs -. dead job spike .-> timeline
```

## Failure Paths

- **Missing trace:** if `trace_id` is absent, fallback to `request_id` for timeline correlation.
- **Collector downstream failure:** OTEL Collector queue + retry keeps data in-memory and degrades to internal timeline.
- **Dead job path:** `system_jobs.status=failed_dead` appears in timeline and triggers Sentry rule.
- **Sentry outage:** errors still persist in `error_aggregations` and timeline.
