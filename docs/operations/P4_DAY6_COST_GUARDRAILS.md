# P4 Day 6 - Cost Model and Guardrails

## Cost Bands

- **Pilot (<= 20 clinics):**
  - traces sampling: 25%
  - retention: 7 days
  - expected monthly infra: low single-digit VPS increment.
- **Medium (20-150 clinics):**
  - traces sampling: 10-15%
  - retention: 14 days
  - add collector replicas and larger storage.
- **Scale (150+ clinics):**
  - traces sampling: adaptive 5-10%
  - retention: 30 days only for error/critical streams.
  - archive cold logs externally.

## Cardinality Guardrails

- Ban unbounded labels (full URL query, raw user input, phone numbers).
- Keep top labels: `service`, `env`, `route`, `clinic_id`, `level`.
- Move high-cardinality fields into payload/body, not labels.

## Sampling Guardrails

- Always-sample:
  - billing transitions
  - support escalation
  - dead jobs
  - auth failures
- Dynamic sampling:
  - low-risk endpoints at reduced rates when QPS spikes.

## Retention Guardrails

- Logs:
  - hot: 7-14 days
  - cold: external object archive if needed.
- Traces:
  - default 7-14 days, error traces pinned for longer.
