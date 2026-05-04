# P4 Day 7 - Acceptance Gates and Rollout

## Simulation-Linked Acceptance Gates

1. **Log-to-trace jump latency**
   - target: <= 3 seconds (p95) from event to correlated trace visibility.
2. **Incident triage time**
   - target: <= 10 minutes from alert to root-cause candidate.
3. **Dead job detection delay**
   - target: <= 60 seconds from dead transition to alert emission.
4. **SLA breach signal delay**
   - target: <= 120 seconds from breach to surfaced signal.

## Validation Inputs

- Use `production_simulation_runs` for repeatable scenario runs.
- Feed scenarios:
  - billing reminder failure
  - messaging retry burst
  - support SLA breach
  - job dead-letter transition

## Rollout Strategy

1. **Shadow mode (no paging):**
   - collector + dashboards enabled, alerts muted.
2. **Partial rollout (10-20% tenants):**
   - alerts enabled for critical rules only.
3. **Full rollout:**
   - all tenants, all critical/high rules active.

## Exit Criteria

- 3 consecutive simulation passes.
- No unresolved critical alert pipeline failures in 48h.
- Correlation contract compliance >= 99% in sampled events.
