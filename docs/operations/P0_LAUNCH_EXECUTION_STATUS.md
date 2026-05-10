# P0 Launch Execution Status

Last updated: 2026-05-09

## 1) Migration ownership lock

- Status: PASS
- Decision: SQL migration path is locked for launch/staging (`whatsapp-bridge/sql/migrations`), EF migrations are reference-only during launch.
- Evidence:
  - `docs/ADR-001-single-source-of-truth-data-model.md`
  - `docs/RELEASE_GATES_RUNBOOK.md`
  - `docs/E2E_PRODUCTION_TEST_RUNBOOK.md`

## 2) Production-like stack proof (compose + gates)

### Compose status snapshot

- Command: `docker compose -f docker-compose.prod.yml --env-file .env.prod.runtime ps`
- Observed UP services:
  - `postgres` (healthy)
  - `n8n`
  - `billing-reminders-job`
  - observability stack (`otel-collector`, `loki`, `tempo`, `grafana`)
- Missing from running set at snapshot time:
  - `ops-dashboard`
  - `clinic-web`
  - `redis`
  - `event-consumer`

### Gate runs

- `npm run audit:production-env` -> PASS
- `npm run e2e:go-live-smoke` -> FAIL (ops-dashboard unreachable)
- `npm run gate:p7` -> NO-GO (multiple network failures to web/ops endpoints)
- `npm run ops:go-live-preflight` -> FAIL (`fetch failed` due unreachable deep-health endpoint)

### Blocking findings

1. `.env.prod` contains a non-env command line, so compose `--env-file .env.prod` fails parsing.  
   Mitigation applied for execution: generated `.env.prod.runtime` with env lines only.
2. Full service bring-up could not be validated end-to-end in this run because critical app services were unreachable during gate execution.

## 3) E2E gap closure status

- Script updated to always write artifact:
  - `scripts/e2e-go-live-smoke.cjs` now writes `e2e-go-live-report.json` on both success/failure.
- Artifact generation:
  - `e2e-go-live-report.json` now exists at repo root after smoke run.
- Playwright scope expanded in:
  - `e2e/tests/smoke.spec.ts`
  - `e2e/README.md`

## 4) Event-consumer decision

- Current mode for launch evidence in this execution: **optional**.
- Policy applied: launch-critical synchronous path remains required; stream fan-out is non-blocking unless explicitly promoted to required mode in release ticket.

## 5) Launch recommendation from this execution

- Current readiness: **NO-GO** until `ops-dashboard` + `clinic-web` are healthy and gates re-run green with fresh artifacts.
- Required rerun checklist:
  1. Bring up full app stack (`ops-dashboard`, `clinic-web`, `redis`, `event-consumer` as decided).
  2. Re-run gates in order: audit -> e2e smoke -> p7 -> go-live preflight.
  3. Attach `p7-go-live-report.json` + `e2e-go-live-report.json` + compose status snapshot to release ticket.
