# P12 Platform OS Runbook

This supplements `docs/operations/P6_RUNBOOK.md` with Platform OS control-plane workflows:
Signals → State → Incidents → Decisions → Actions → Verification.

## 1) Provision + migrations

From repo root:

- Apply DB migrations (including 040–044):
  - `node ops-dashboard/scripts/apply-scheduling-sql.cjs`

## 2) Start workers

In `ops-dashboard/`:

- State engine (30s):
  - `npm run worker:state-engine`
- Blast radius (2m):
  - `npm run worker:blast-radius`
- Decision engine (60s):
  - `npm run worker:decision-engine`
- Action verification (30s):
  - `npm run worker:action-verify`

## 3) APIs (internal)

All require:
- `Authorization: Bearer $SCHEDULING_SERVICE_TOKEN`
- `x-platform-scope: true`
- and `x-user-id` for RBAC

- State:
  - `GET /api/internal/platform/system/state`
- Decision rules:
  - `GET /api/internal/platform/decision-rules`
- Actions:
  - `GET /api/internal/platform/actions`
  - `POST /api/internal/platform/actions`
  - `POST /api/internal/platform/actions/[id]/execute`
  - `GET /api/internal/platform/actions/[id]/results`

## 4) Web operator flows

- Control Center:
  - `/platform`
- Create action:
  - `/platform/actions/create`
- Review execution + verification:
  - `/platform/actions` then check result via API `/api/platform/actions/[id]/results`

## 5) Test gates

From repo root:
- `npm run build:ops`
- `npm run build:web`

From `ops-dashboard/`:
- `npm test`

