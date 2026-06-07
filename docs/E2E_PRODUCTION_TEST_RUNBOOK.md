# E2E production test runbook (manual)

Use this checklist after deploy or before a major release. Automated coverage lives in `ops-dashboard` Vitest (`npm test`) and the scripts below; many scenarios still need a human on WhatsApp / bridge / Postgres.

## Launch lock prerequisites (must be explicit)

- Migration authority for launch/staging is SQL path only (`whatsapp-bridge/sql/migrations` via ops scripts), per `docs/ADR-001-single-source-of-truth-data-model.md`.
- Record event-consumer stance before executing go-live checks:
  - `required`: consumer must be up and healthy.
  - `optional`: consumer may be down; sync booking path remains launch-critical path.

For field pilot operations, also use:

- `docs/PILOT_LAUNCH_PLAYBOOK.md`
- `docs/PILOT_DAILY_CHECKLIST.md`
- `docs/PILOT_INCIDENT_RUNBOOK.md`

## Preconditions

- `DATABASE_URL`, `SCHEDULING_SERVICE_TOKEN`, `JWT_SECRET` set for ops-dashboard.
- Bridge running with `GET /ready` = 200 when paired.
- Optional: `REDIS_URL` for streams + `event-consumer` service (Phase A fan-out only).
- **Angular UI:** from `frontend/ClinicSaaS.Web`, `npx ng test --no-watch --browsers=ChromeHeadless` should pass before go-live.

## Final Go-Live Protocol (field validation)

Technical readiness is necessary but **not sufficient**. Complete these before pointing real clinics at production.

### A) `domain_events` — mandatory for audit trail

Without [`006_domain_events.sql`](../whatsapp-bridge/sql/migrations/006_domain_events.sql) the event ledger is incomplete (`replay` returns `skipped`).

```bash
cd ops-dashboard
# Applies scheduling CRM bundle including 006 (adjust if your ops uses a different apply path):
npm run db:apply-scheduling
# Confirm rows (replace <id> with a real conversation_id):
npm run db:replay-events -- --conversation=<id>
```

**Pass:** JSON array of events (not `"skipped": true`). **No** duplicate inserts from this script (read-only `SELECT`).

### B) Stack up + deep health

Bring up: Postgres, Redis, `ops-dashboard`, `event-consumer` (if using streams), `whatsapp-bridge`, n8n as needed.

Capture evidence at this step:

- `docker compose ... ps` output for full stack status
- health/deep JSON snapshot
- decision note whether event-consumer is `required` or `optional`

Automated strict check (requires live `ops-dashboard` + token):

```bash
cd ops-dashboard
$env:OPS_BASE_URL="https://ops.example.com"   # or http://127.0.0.1:3001
$env:SCHEDULING_SERVICE_TOKEN="..."
npm run ops:go-live-preflight
```

**Default pass rules:** HTTP 200, `status` is `ok` (not `degraded`/`down`), `dead_letter_events_5m` is 0, no `dead_letter_spike`. Optional: `GO_LIVE_MAX_LAG_MS` if you want to bound stream lag (idle systems can have large `lag_ms` — see script header).

### C) Real WhatsApp path (phone in hand)

Follow §1 scripted dialogue; confirm latency, no duplicate outbound, booking visible to secretary workflow.

### D) Secretary UI (`/secretary`)

Verify patient + appointment; try reschedule / cancel / doctor-left; confirm patient only gets WhatsApp per **reply-only** policy where applicable.

### E) Kill switch, Redis, load, chaos, soak, alerts

Execute §8–§10, then **load-test** from [Scripted smoke](#scripted-smoke-from-repo) (`npm run ops:load-test` on staging). Soak **~3h** with RAM/CPU watch. For alerts: stop consumer or Redis briefly → `health/deep` should reflect `degraded`; if `ALERT_WEBHOOK_URL` is set, confirm webhook receives payload on dead-letter spike (poll infrequently).

### F) Launch sizing

Start with **one clinic** for several days; expand only after stability.

### F.1) 72h sprint execution gates

```bash
cd ops-dashboard
# Day 2 pilot gate (requires manual confirmations via env flags):
npm run ops:pilot-day2

# Day 3 controlled launch gate:
npm run ops:soft-launch-day3
```

## Pre-Launch Production Gate (before first real clinic)

Run these in order where applicable. Record pass/fail and timestamps in your release ticket.

### 1) Real WhatsApp dry run (mandatory)

- Use a **real** patient number (not emulator): bridge paired, `GET /ready` = 200.
- Send a scripted dialogue (e.g. greeting → booking intent → specialty → name → symptom → slot choice `1`).
- Observe: odd delays, duplicate replies, or bot-like bursts. **Fail** if duplicate outbound for the same intent, or sustained latency above ~5s without load, or same text sent twice unintentionally.

### 2) Shadow mode (optional, low risk)

- Goal: observe behavior without patient-visible WhatsApp sends.
- **API:** call `POST /api/internal/conversations/process-inbound` with `execute_send: false` so CRM/FSM run but bridge patient send is skipped (see `processInbound` / bridge path).
- Alternatively keep bridge up but do not pair production sender until checks pass.

### 3) Production flags (verify in `.env` / compose)

| Variable | Expected for go-live |
|----------|----------------------|
| `WHATSAPP_KILL_SWITCH` | `false` (or unset) |
| `PATIENT_REPLY_WINDOW_MINUTES` / `PATIENT_REPLY_WINDOW_MS` | e.g. `15` / window you approved |
| `WHATSAPP_OPS_SEND_MAX_PER_WINDOW` | `10` (or tuned with bridge `rateSafety`) |
| `SYSTEM_MODE` | Set to `production` for ops-dashboard startup log (see `instrumentation.ts`) |

### 4) Alerts (DLQ, lag, bridge)

- **Manual minimum:** poll `GET /api/system/health/deep` (Bearer `SCHEDULING_SERVICE_TOKEN` or `HEALTH_DEEP_TOKEN`); watch `bridge`, `lag_ms` / `stream_lag_ms`, `pending_count`, `dead_letter_events_5m`, and `dead_letter_spike`.
- **Optional automation:** set `ALERT_WEBHOOK_URL` — when `dead_letter_spike` is true, deep health fires one JSON `POST` (see `ops-dashboard/README.md`). Poll infrequently to avoid webhook noise.

### 5) Memory / soak (2–3 hours)

- Run ops-dashboard + bridge + consumer (if used) under realistic light load.
- Watch **RSS** for the Node processes / containers: **fail** if memory climbs without plateau (unbounded leak). Document baseline and peak.

### 6) Database safety (no double-booked slot rows)

```bash
cd ops-dashboard && npm run ops:data-integrity
```

Ad-hoc SQL (must return **0 rows** for active overlaps):

```sql
SELECT doctor_id, starts_at, COUNT(*) AS c
FROM appointments
WHERE deleted_at IS NULL
  AND status NOT IN ('cancelled', 'no_show')
GROUP BY doctor_id, starts_at
HAVING COUNT(*) > 1;
```

### 7) Event “replay” script (read-only)

```bash
cd ops-dashboard && npm run db:replay-events -- --conversation=<id>
```

This runs **SELECT** on `domain_events` only ([`scripts/replay-domain-events.cjs`](../ops-dashboard/scripts/replay-domain-events.cjs)). It does **not** mutate state or replay FSM; executable replay is Phase B ([`docs/PROCESS_INBOUND_ASYNC.md`](PROCESS_INBOUND_ASYNC.md)). If the table is missing, the script prints a JSON `skipped` payload and **exits 0** (safe for CI before migration `006`).

### 8) Kill switch test

- Set `WHATSAPP_KILL_SWITCH=true`, send inbound via bridge or `process-inbound` with send enabled.
- **Expect:** no patient WhatsApp send (see [`globalReplyPolicy`](../ops-dashboard/lib/whatsapp/globalReplyPolicy.ts)). Then set kill switch back to `false`.

### 9) Full dependency failure (Redis)

- Stop Redis briefly; send one inbound through the **synchronous** path.
- **Expect:** inbound still persisted in Postgres; processing does not depend on Redis for the critical booking path. **Stream events** may be skipped if `XADD` fails ([`redisPublish.ts`](../ops-dashboard/lib/events/redisPublish.ts)) — deep health should show `redis` / `degraded`. Restart Redis and confirm `deep` returns healthy.

### 10) Human chaos test

- Ask a non-technical person to send vague Arabic messages (“مدري”, “ايش في”, “بدي شي”, “غيره”, etc.).
- **Pass:** no crash, no hung conversation, no wrongful confirmed booking; handoff or safe reprompts per product rules.

## Scripted smoke (from repo)

One-shot (Vitest + chaos-smoke + data-integrity; needs `DATABASE_URL` for the last step):

```bash
cd ops-dashboard
npm run ops:runbook-smoke
```

Or step by step:

```bash
cd ops-dashboard
npm test
node scripts/chaos-smoke.cjs
node scripts/data-integrity-check.cjs   # requires DATABASE_URL
# load (hits live API — use staging). مع `DATABASE_URL` يُشغَّل فحص SQL للتكرار (dedupe / idempotency)؛ عطّله: `$env:LOADTEST_RUN_SQL="0"`.
# $env:SCHEDULING_SERVICE_TOKEN="..."; $env:OPS_BASE_URL="https://..."; $env:DATABASE_URL="..."; node scripts/load-test.cjs
# خروج 3 = وجد تكراراً محتملاً في نتائج SQL.
```

## Deep health

```bash
curl -sS -H "Authorization: Bearer $SCHEDULING_SERVICE_TOKEN" \
  "$OPS_BASE_URL/api/system/health/deep"
```

Expect `status` `ok` or `degraded` with JSON fields `db`, `redis`, `bridge`, `stream_lag_ms`, `pending_count`. If `HEALTH_DEEP_TOKEN` is set, that bearer is accepted as well.

### G) Single WhatsApp path + SaaS tenant link + SQL bundle

1. Confirm **one** inbound handler is live for production numbers (see `docs/WHATSAPP_SOURCE_OF_TRUTH.md`). Set `OPS_WHATSAPP_PRIMARY_HANDLER=ops` on ops/bridge side where applicable.
2. Apply CRM migrations that include `clinic_saas_tenant_links` and optional `clinic_public_hours` / `ai_interaction_logs`:

```bash
cd ops-dashboard
npm run db:apply-scheduling
```

3. Link at least one `clinic_id` to a .NET tenant UUID (example in `docs/SAAS_CLINIC_TENANT_LINK.md`). Verify:

```bash
curl -sS -H "Authorization: Bearer $SCHEDULING_SERVICE_TOKEN" \
  "$OPS_BASE_URL/api/internal/clinic-saas-link?clinic_id=1"
```

### H) Reverse proxy + TLS (production layout)

- Terminate TLS at **Nginx** (or cloud LB) and forward to `ops-dashboard` (e.g. port 3001) and `apps/web` (e.g. port 3000).
- Keep `SCHEDULING_SERVICE_TOKEN` and `DATABASE_URL` only on server-side services; never expose the service token to browsers.
- Reference compose patterns in `docker-compose.prod.yml` / `docker-compose.clinic.yml` and extend with your proxy container as needed.
- For quick n8n hardening + backup + smoke checks, run [`docs/N8N_LAUNCH_CHECKLIST.md`](N8N_LAUNCH_CHECKLIST.md).

## Manual scenarios (1–17 outline)

1. **Inbound happy path:** patient sends normal text → reply in-app + optional bridge send when enabled.
2. **Duplicate webhook:** same `messageId` / dedupe hash → `duplicate: true`, no second booking.
3. **Outside hours:** message stored; policy / copy per `normalizeInbound` and reply window.
4. **Urgent keywords:** triage path, optional staff alert when configured.
5. **Booking flow start:** intent booking → slot offer or routing prompts.
6. **Clinic pick (multi-clinic):** choose clinic → doctor list updates.
7. **Slot confirm:** confirm selection → single appointment; repeat confirm → idempotent duplicate path.
8. **Spam / rapid messages:** same conversation quick sequence → no double booking (DB `FOR UPDATE` on hot paths).
9. **Bridge down:** `execute_send: false` or enqueue path → outbox / blocked per policy; check `chaos-smoke` + deep health `bridge`.
10. **Redis down:** processing should still complete synchronously; deep health `redis` not ok, overall `degraded`.
11. **Kill switch:** `WHATSAPP_KILL_SWITCH=true` → patient sends blocked per `globalReplyPolicy`.
12. **Outbox drain:** run internal `outbox-drain` job; verify no unbounded 500s; blocked rows for HARD DROP.
13. **Secretary reschedule / cancel:** API paths with auth.
14. **Doctor queue / actions:** as applicable to deployment.
15. **Metrics:** `GET /api/internal/metrics/product` with service token.
16. **Event replay:** `npm run db:replay-events` is **query/reporting only** today; executable replay is tied to Phase B async (`docs/PROCESS_INBOUND_ASYNC.md`).
17. **Consumer:** with Redis + migrations `007`/`008`, run `event-consumer` → logs show `fanout_inbound_recorded`; duplicate deliveries increment `duplicate_event_skip` without double inserts in `processed_events`.
18. **Booking + display name:** new patient without `display_name` receives name prompt; after name, doctor list or slots continues. With `OLLAMA_URL` set, doctor hint in free text can skip the doctor list when uniquely matched.
19. **Hybrid Ollama (free text, `flow_step=idle`):** optional when `OLLAMA_URL` is set — see [`docs/OLLAMA_VPS.md`](OLLAMA_VPS.md). Without Ollama, scenario 20 covers the same intents via rules.
20. **Pure rules engine (no `OLLAMA_URL`, `flow_step=idle`):** after deploy, send these seven messages in order on a test number (one clinic locked after first explicit pick):
    - `بدي موعد` → booking FSM (not menu-only stall)
    - `كم الكشف` → prices from `visit_types` or `clinics.metadata.pricing` fallback
    - `بدي د. سامي` → doctor match / disambiguation / slots
    - `أيوه` during `slot_offer` or `awaiting_confirm` → confirm via FSM (rules skip interactive steps)
    - `لا` during slot offer → alternate slot prompt
    - `إلغاء موعد` → `awaiting_cancel_confirm` then `1` confirms cancel
    - off-topic (e.g. weather) → polite redirect + main menu
    Verify `GET /api/internal/metrics/product` includes `rules_engine_routed_total`, `rules_engine_unknown_total`, `clinic_lock_applied_total`. After clinic pick, `conversations.routing->locked_clinic_id` stays fixed.

Record pass/fail and timestamps in your change ticket.

## Mandatory artifacts to attach

- `p7-go-live-report.json`
- `e2e-go-live-report.json`
- latest release-gates workflow run link / logs
- stack status snapshot (`docker compose ... ps`)
