# Release Gates Runbook

This runbook describes how to execute the release-readiness gates against a
production-like environment before every launch or major cut.

## Scope

| Gate | Command | What it validates |
|------|---------|-------------------|
| Clinic OS CI | `.github/workflows/clinic-os-ci.yml` | lint/test/build for `apps/web`, `ops-dashboard`, `whatsapp-bridge` + production env audit |
| Root E2E smoke | `npm run e2e:go-live-smoke` (repo root) | Server reachability (3000/3001), login round-trip, metrics endpoint, billing smoke |
| P7 Go-Live Gate | `npm run gate:p7` (repo root) | `smoke:p5`, `ops:alerts:check`, `validate:p6-ops`, `data-integrity-check`, optional ops-dashboard tests |
| Deep Health preflight | `npm run ops:go-live-preflight` (`ops-dashboard/`) | `/api/system/health/deep` thresholds (status, dead_letter_events_5m, lag_ms) |
| Production env audit | `npm run audit:production-env` (repo root) | Blocks dev toggles and placeholder secrets in a production profile |
| Playwright smoke | `npm test` in [`e2e/`](../e2e/README.md) | Browser-level checks on login, dashboard redirect, and appointments |
| UAT checklist | [`MANUAL_UAT_LAUNCH_CHECKLIST_AR.txt`](../MANUAL_UAT_LAUNCH_CHECKLIST_AR.txt) | Role-based manual verification across the UI |

## Prerequisites

- Postgres reachable via `DATABASE_URL` (same instance used by `ops-dashboard`).
- `ops-dashboard` built and running on `http://127.0.0.1:3001`.
- `apps/web` built and running on `http://127.0.0.1:3000` with
  `OPS_DASHBOARD_URL=http://127.0.0.1:3001`.
- `SCHEDULING_SERVICE_TOKEN` (or `HEALTH_DEEP_TOKEN`) exported in the shell.
- `whatsapp-bridge` (if in scope for the launch) running on `http://127.0.0.1:3101`.

## Manual run (order matters)

```powershell
# 1. Block any dev-only toggle from leaking into the environment
$env:NODE_ENV = "production"
npm run audit:production-env
$env:NODE_ENV = ""

# 2. CI-style suites (run from the repo root; scripts chdir when needed)
npm run e2e:go-live-smoke
npm run gate:p7

# 3. Deep health thresholds (requires /api/system/health/deep token)
cd ops-dashboard
npm run ops:go-live-preflight
cd ..
```

Report artifacts are written at repo root:

- `p7-go-live-report.json`
- `e2e-go-live-report.json`

Attach both to the release ticket alongside the signed UAT checklist.

## Automated run (GitHub Actions)

- `.github/workflows/clinic-os-ci.yml` runs on every push/PR — it is the PR
  gate and always blocks merges on failure.
- `.github/workflows/release-gates.yml` runs nightly on `main` and on demand
  (`workflow_dispatch`). It provisions a disposable Postgres, boots
  `apps/web` and `ops-dashboard`, then executes the suites above and uploads
  reports as artifacts.

## Exit criteria for launch

1. Clinic OS CI green on the release commit.
2. Latest Release Gates run green (or every failure documented and waived).
3. `go-live-preflight` output shows `"ok": true` with
   `"status": "healthy"` (or `"degraded"` only when `GO_LIVE_ALLOW_DEGRADED=1`
   is explicitly approved).
4. Signed UAT checklist attached to the release ticket.
