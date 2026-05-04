# P13 Platform Dashboard Pro — Ops Notes

## 1) What changed (high level)

- `/platform` أصبح Command Dashboard (triage-first): Incidents → Decisions → Actions + Golden signals + KPIs.
- Bulk actions:
  - Incidents: Bulk Ack / Bulk Resolve
  - Actions: Bulk Execute (pending only)
- Safety UX:
  - Unified Safety Dialog (reason + impact + typed confirmation for critical)
  - RBAC gating on write buttons (disabled when missing perms)
- Reliability:
  - Ops-down banner داخل الـ shell على صفحات `/platform/*`
  - BFF يعيد 503 منسق بدل crash عند انقطاع `ops-dashboard`
- Observability:
  - Structured logs events للـ writes: action created/started/success/failed + decision approved + incident ack/resolved

## 2) Run locally

### Web
- `cd apps/web`
- `npm run dev`
- `http://localhost:3000/platform`

### Ops
- `cd ops-dashboard`
- `npm run dev`

## 3) Workers (optional for live computed state)

From `ops-dashboard/`:
- `npm run worker:state-engine`
- `npm run worker:blast-radius`
- `npm run worker:decision-engine`
- `npm run worker:action-verify`

## 4) Quick reliability test

1) Stop ops (`Ctrl+C` في `ops-dashboard`)\n
2) Open:\n
- `/platform`\n
- `/platform/incidents`\n
- `/platform/decisions`\n
- `/platform/actions`\n
\n
Expected:\n
- Banner يظهر \"Ops backend unavailable\" + كل صفحة تعرض ErrorState + Retry بدل blank\n
\n
3) Restart ops ثم Retry.

