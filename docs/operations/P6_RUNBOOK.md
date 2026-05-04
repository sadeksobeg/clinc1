# P6 Operations Runbook

This runbook is for live incident response in the first 5 minutes, using only controls and endpoints already available in this system.

## 0) Incident Severity and Ownership

- `SEV-1` critical: production outage, data integrity risk, billing risk, or messaging safety risk.
- `SEV-2` high: major degradation with workaround.
- `SEV-3` medium: partial feature degradation without immediate safety or revenue risk.

During incident:
- Incident commander: one owner only.
- Scribe: record timeline with UTC timestamps.
- Communications: single channel for status updates every 10 minutes.

## 1) First 5 Minutes Triage (All Incidents)

### Step 1: Confirm signal
- Check alerts baseline:
  - `npm run ops:alerts:check` (inside `ops-dashboard`)
- Check deep health:
  - `node scripts/go-live-preflight.cjs`

### Step 2: Gather evidence
- Pull health/queues/failures/errors:
  - `GET /api/internal/system/health`
  - `GET /api/internal/system/queues`
  - `GET /api/internal/system/failures`
  - `GET /api/internal/system/errors`
- Pull timeline:
  - `GET /api/internal/system/timeline?limit=100`

### Step 3: Classify and choose path
- Containment first if patient safety, billing integrity, or WhatsApp trust is at risk.
- Recovery first if only non-critical degradation.

### Step 4: Containment controls
- Primary path (recommended): use `Ops Center -> Incident Control` buttons.
  - Click `Enter Emergency Mode` for full containment.
  - Or use targeted buttons:
    - `Stop WhatsApp`
    - `Disable AI`
    - `Disable Auto-Booking`
- Confirm state pills update to `true` and verify timeline logs for `system.emergency.flag_toggle`.
- Fallback path (only if dashboard is unavailable): use env toggles manually.

### Step 5: Recovery decision gate
- Move to recovery only after:
  - root cause hypothesis exists
  - one verification signal confirms it
  - rollback path is defined

## 2) Operational Commands (PowerShell)

Assume:
- `OPS_BASE_URL=http://127.0.0.1:3001`
- valid `SCHEDULING_SERVICE_TOKEN`

### 2.1 Health and alert sweep
```powershell
$env:OPS_BASE_URL="http://127.0.0.1:3001"
$env:SCHEDULING_SERVICE_TOKEN="REDACTED"
npm run ops:alerts:check
node scripts/go-live-preflight.cjs
```

### 2.2 Smoke verification gate
```powershell
cd "d:\Sadek Company\Mid Auto"
npm run smoke:p5
```

### 2.3 Quick API checks
```powershell
$h = @{ Authorization = "Bearer $env:SCHEDULING_SERVICE_TOKEN" }
Invoke-RestMethod "$env:OPS_BASE_URL/api/internal/system/health" -Headers $h
Invoke-RestMethod "$env:OPS_BASE_URL/api/internal/system/queues" -Headers $h
Invoke-RestMethod "$env:OPS_BASE_URL/api/internal/system/failures" -Headers $h
Invoke-RestMethod "$env:OPS_BASE_URL/api/internal/system/errors?limit=20" -Headers $h
Invoke-RestMethod "$env:OPS_BASE_URL/api/internal/system/timeline?limit=50" -Headers $h
```

## 3) Playbooks

## 3.1 DB Down

### Detection
- `ops:alerts:check` raises `system.db.down`
- `/api/internal/system/health` returns `db_ok=false` or HTTP 500

### Verification
- `go-live-preflight` fails with `status_down`
- timeline shows sudden failures across unrelated routes

### Immediate actions
1. Enable containment mode:
   - Preferred: `Ops Center -> Incident Control -> Enter Emergency Mode`
   - Verify in status pills and timeline.
2. Stop manual retries that write to DB.
3. Keep Ops Center and read-only diagnostics available if possible.

### Recovery steps
1. Restore DB connectivity.
2. Re-run:
   - `npm run ops:alerts:check`
   - `node scripts/go-live-preflight.cjs`
3. Run full gate:
   - `npm run smoke:p5`
4. Re-enable switches in order:
   - Preferred via dashboard:
     - `Exit Emergency Mode`, then targeted toggles if needed.
   - Order remains:
     - decisions -> auto-book -> WhatsApp send.

### Exit criteria
- health check green
- no fresh critical errors in 15 minutes
- `smoke:p5` pass

### Postmortem data
- alert payload
- timeline window (before/after)
- DB error fingerprints

## 3.2 Jobs Dead Queue Spike

### Detection
- `jobs.dead.present` or `jobs.dead.spike24h`
- `queues.jobs_dead > 0`

### Verification
- dead jobs endpoint:
  - `/api/internal/jobs/dead`
- repeated `job_type` and same last error pattern

### Immediate actions
1. Do not mass-retry all dead jobs.
2. Pause risky producers where needed (disable auto actions).
3. Isolate one failing job type first.

### Recovery steps
1. Fix root cause for top failing job type.
2. Retry a single sample job.
3. If successful, resume batched retries.

### Exit criteria
- dead queue trend decreasing
- no new dead jobs for 30 minutes

### Postmortem data
- top 3 failing job types
- first bad deploy/config change

## 3.3 WhatsApp/Messaging Failures

### Detection
- `messaging.failures.spike`
- `messaging.outbox.blocked`
- queue backlog growth in outbox/dead letters

### Verification
- check bridge readiness (`/ready`)
- inspect policy failures (window/kill-switch)
- check timeline for send error bursts

### Immediate actions
1. Click `Stop WhatsApp` in `Ops Center -> Incident Control` if patient-impacting failures continue.
2. Keep staff alerts path available when safe.
3. Prevent retry storms; no blind resend loops.

### Recovery steps
1. Confirm bridge and outbound policy status.
2. Replay only safe pending messages with controls.
3. Monitor block/failure trends for 30 minutes.

### Exit criteria
- messaging failures return to baseline
- blocked outbox below threshold

### Postmortem data
- failed message sample
- policy decision reason
- bridge response status distribution

## 3.4 Billing Webhook Failures

### Detection
- `billing.webhook.failures.spike`
- failures in `billing_processed_events`

### Verification
- check signature validation path
- verify idempotency keys and replay detection behavior

### Immediate actions
1. Freeze any risky manual billing transitions.
2. Do not duplicate charge/approve paths while webhook integrity is uncertain.

### Recovery steps
1. Reconcile failed events with idempotency checks.
2. Replay only verified safe events.
3. Verify invoices and subscription state consistency.

### Exit criteria
- no new failed webhook events for 30 minutes
- reconciliation report clean

### Postmortem data
- failed event IDs
- replay outcomes
- any manual overrides

## 3.5 High Error Spike

### Detection
- `errors.critical.occurrence_spike`
- sudden rise in high/critical fingerprints

### Verification
- map fingerprint -> timeline events
- identify top endpoint/service by frequency

### Immediate actions
1. Contain affected path (feature gate / kill switch).
2. Keep core read paths operational.
3. Avoid global restarts unless required.

### Recovery steps
1. Patch or rollback targeted component.
2. Verify via:
   - timeline trend
   - errors endpoint
   - `smoke:p5`

### Exit criteria
- critical spike resolved
- no new matching fingerprint surge for 20 minutes

### Postmortem data
- fingerprint list
- triggering deploy/change
- rollback vs patch timing

## 4) Emergency Mode (Dashboard-first)

Emergency mode objective: stop risky write/send automation while preserving monitoring/support visibility.

### Enter emergency mode
Primary path:
- Open `Ops Center -> Incident Control`
- Enter required reason
- Click `PANIC BUTTON` (or `Enter Emergency Mode`)
- Confirm all pills become `true`:
  - `EmergencyMode`
  - `WhatsApp`
  - `AI`
  - `AutoBooking`
- Confirm timeline includes `system.emergency.flag_toggle` entries.
- Confirm `Auto-snapshot` card is visible (queues/failures baseline captured for postmortem).

Then verify:
```powershell
npm run ops:alerts:check
node scripts/go-live-preflight.cjs
```

Fallback path (dashboard unavailable only):
- apply equivalent env toggles manually and restart required services.

### What remains available
- Ops dashboards
- timeline/errors visibility
- support triage flows (read and controlled writes)

### Exit emergency mode
- Preferred: click `Exit Emergency Mode` from Incident Control
- verify pills return to expected state
- run `smoke:p5`
- watch alerts for at least 15 minutes

## 5) Safety Guards (Never Break)

- Never resend patient messages blindly.
- Never run mass retry on dead jobs before root-cause validation.
- Never alter billing state without idempotency/replay checks.
- Always correlate alert -> timeline -> error fingerprint before mitigation.
- Treat timeline as source of truth for incident chronology.

## 6) Launch Readiness Gate

Before first real clinic:
- `npm run smoke:p5` is PASS
- observability stack healthy
- `npm run ops:alerts:check` returns 0
- outage drill executed once manually
- this runbook has a completed dry run by on-call owner

## 7) Drill Cadence

- Pre-launch: weekly tabletop + one dry command drill
- Post-launch month 1: weekly
- Steady state: monthly

Minimum drill set:
1. DB down simulation
2. dead jobs spike
3. messaging degradation with kill-switch activation

Run drills from `Ops Center -> Simulation` using:
- `Drill: DB degradation`
- `Drill: Messaging failure spike`
- `Drill: Billing failure spike`
- `Drill: Dead jobs spike`
- `Drill: Load burst (P7)`

Each drill must produce explicit `PASS/FAIL` checks before close-out.

## 8) P7 — Production Hardening + Go-Live Gate

### What P7 adds (summary)

- **WhatsApp safety (Balanced)**: per-clinic + global send windows, human-like jitter before bridge calls, failure circuit → auto `whatsapp_send_disabled` (see `ops-dashboard/lib/whatsapp/whatsappSafetyLayer.ts`). Health API exposes `whatsapp_safety` counters.
- **Patient safety (AI)**: blocks diagnosis / prescribing-style hints in the decision executor (`patientSafetyGuard`).
- **Outbound guardrails**: length / hard-block / URL sanitization before patient sends (`outboundMessageGuard` + `sendPatientWhatsAppGuarded`).
- **Billing protection**: manual **approve** requires `idempotency_key` (≥16 chars) + `billing_confirm` + exact phrase `CONFIRM_APPROVE_PAYMENT` on internal review API.
- **Data integrity**: migration `035_p7_conversation_row_version.sql` + extra checks in `ops-dashboard/scripts/data-integrity-check.cjs`.
- **Load simulation**: drill `load_burst` models high backlog + SLO latency stress (see simulation run metrics/checks).

### Automated go / no-go

From repo root:

```powershell
npm run gate:p7
```

Produces `p7-go-live-report.json` and exits non-zero on any failed step.

### Rollback triggers (P7)

- WhatsApp safety circuit trips repeatedly without root cause.
- Any `patient_safety.decision_guard` or `outbound_guard` spike correlated with deploy.
- Billing double-confirm bypass attempts (400 `billing_double_confirm_required`) clustered abnormally.

## 9) Pre-clinic soft launch — gates + full manual checklist

You are no longer testing “code only”; you are validating **patients + WhatsApp + bookings + money**. If any mandatory gate fails, **do not** onboard a real clinic.

### Phase A — Automated gates (mandatory, in order)

From repo root:

```powershell
npm run smoke:p5
npm run ops:alerts:check
npm run gate:p7
```

| Gate        | Pass criterion                          |
| ----------- | --------------------------------------- |
| `smoke:p5`  | Exit 0, all steps PASS                  |
| `alerts`    | `ops:alerts:check` → `alerts_count: 0`  |
| `gate:p7`   | Exit 0, report ends with **GO**        |

Optional stricter run (includes ops-dashboard unit tests): run `npm run gate:p7` without `SKIP_OPS_DASHBOARD_TESTS=true`.

### Phase B — AI + patient safety (manual)

Use a **test clinic** and controlled inbound messages (staging), then verify:

- No direct **diagnosis** or **drug prescribing** in automated patient-visible text.
- When the medical guard fires: `structured_logs.event_name = patient_safety.decision_guard` appears in timeline; `conversations.routing` may include `patient_safety_guard` (blocked hints + handoff signal).

Example message themes to try (Arabic): severe cardiac pain, high fever in a child, “give me medicine without a doctor” — expect safe routing / handoff, not clinical prescribing.

### Phase C — WhatsApp safety + PANIC

- Ops Center → **System Health**: confirm `whatsapp_safety` counters move under synthetic load; run **Drill: Load burst (P7)** and confirm explicit FAIL checks (expected for that drill).
- **PANIC BUTTON** (Ops Center → Incident Control): after activation, patient WhatsApp sends must not go out; timeline should include `system.emergency.flag_toggle`.
- **Auto-snapshot**: `GET /api/ops/system/emergency/status` (authenticated session) — response `emergency.latest_snapshot` should be non-null immediately after entering emergency mode (there is no separate `/emergency/status` page; use API or Ops Center card).

### Phase D — Billing double-confirm

- Approve **without** `idempotency_key` (length ≥16) and without `billing_confirm` + exact phrase **`CONFIRM_APPROVE_PAYMENT`** → must **400** (`billing_double_confirm_required` / `billing_idempotency_required`).
- Valid approve path: use Billing Admin UI (it sends confirm + long idempotency key) or call internal review API with all required fields once.

### Phase E — Data integrity

```powershell
cd ops-dashboard
node scripts/data-integrity-check.cjs
```

Expect `ok: true` and `failing: []`. (Or rely on `npm run gate:p7`, which runs the same script with `load-ops-env` applied.)

### Phase F — Failure game + human error

- Run incident drills (`db_degraded`, `whatsapp_failure_spike`, `billing_failure_spike`, `dead_jobs_spike`, `load_burst`) from Ops Center; then **PANIC** and confirm containment + snapshot + timeline clarity.
- Retry **duplicate** actions (same billing idempotency key, duplicate job intent): system must remain idempotent / no double money movement.

### Phase G — Runbook dry run

Open this file (`P6_RUNBOOK.md`) during a timed exercise and follow **only** the written steps (no improvisation). If the team hits “we don’t know what to do”, treat as **NO-GO** until the runbook is updated.

### Final GO / NO-GO (first real clinic)

**GO** only if all hold: automated gates green; PANIC verified; WhatsApp limits + circuit behavior understood; AI safety observed in manual tests; billing rejects unsafe approves; integrity clean; timeline/trace correlation trusted under a full-path rehearsal.
