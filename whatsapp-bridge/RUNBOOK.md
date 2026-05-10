# Clinic Pro — Runbook (Bridge + n8n + Postgres)

## 1) Prerequisites

- PostgreSQL reachable from n8n (Docker: use `host.docker.internal` from container to host DB).
- Node.js 18+ for the bridge.
- Chrome or Edge installed (non-headless pairing) unless `WA_HEADLESS=true`.
- Optional: `pg_dump` for backups ([scripts/backup-crm.ps1](scripts/backup-crm.ps1)).

## 2) Local stack (Docker)

From repo root:

```bash
docker compose -f docker-compose.clinic.yml up -d
```

- Postgres CRM: `localhost:5435`, database `clinicsaas`, user/password `postgres`/`postgres` (change for real use).
- n8n: `http://localhost:5678` (SQLite volume inside container for n8n’s own DB).

## 3) Bootstrap database

**New install (v2 multi-tenant schema):**

```sql
\i sql/crm-bootstrap.sql
```

**Upgrading an older v1 schema** (already had single-tenant tables):

```sql
\i sql/migrations/001_multitenant.sql
```

**Clinic scheduling (doctors, slots, secretary/doctor dashboards):**

```sql
\i sql/migrations/003_clinic_scheduling.sql
\i sql/seed-scheduling-demo.sql
\i sql/seed-real-world-validation.sql
```

**Core Backend V2 (dialogue JSON + `core_outbox` for bridge retries):**

```sql
\i sql/migrations/004_core_outbox_dialogue.sql
\i sql/migrations/005_core_outbox_blocked_status.sql
\i sql/migrations/006_domain_events.sql
```

Set the same `SCHEDULING_SERVICE_TOKEN` in **ops-dashboard** `.env` / `.env.local` and pass it to the **n8n** container (see `docker-compose.clinic.yml`). The thin n8n path calls `OPS_DASHBOARD_URL` + `/api/internal/conversations/process-inbound`.

**Cron (Bearer `SCHEDULING_SERVICE_TOKEN`) — ترتيب مقترح وحماية من حدود الإرسال:**

| Job | تردد مقترح | ملاحظات |
|-----|------------|---------|
| `POST .../scheduling/reminders/due` | كل **1 دقيقة** | يصفّ صفوف `core_outbox` لتذكير ~قبل الموعد؛ لا تُشغّل أكثر من مرة متزامنة لنفس العيادة إن كان الـ worker بطيئاً. |
| `POST .../scheduling/late-due` | كل **1 دقيقة** (بعد reminders أو بالتوازي مع فصل قفل DB) | يحدّث `patient_arrival_state` ويصفّ تنبيهات التأخير. |
| `POST .../jobs/outbox-drain` | كل **5–15 ثانية** تحت الحمل، أو **15–60 ثانية** عند حمل خفيف | يرسل دفعات من الجسر؛ **يجب** أن يبقى معدل الإرسال الفعلي تحت حدود الجسر (`MAX_SENDS_PER_MINUTE_PER_CHAT`, `MAX_REPLIES_PER_HOUR_PER_CHAT` في [.env.example](.env.example)) لتجنب 429 أو حظر واتساب. |

**ترتيب آمن عند جدولة واحدة:** reminders → late-due → outbox-drain (أو تشغيل outbox-drain بشكل أغلى تكراراً كـ «مضخة» مستقلة بين دورتين للجدولين الأولين).

**تحذير rate limit:** إذا قلّلت فترة outbox-drain جداً مع صف طويل في `core_outbox`، قد تصل دفعات الإرسال إلى نفس `chat_id` أسرع من حدود الجسر — زِد الفترة أو زِد `SEND_RETRY_BASE_MS` وراقب `/metrics` على الجسر.

**Reactive + HARD DROP (ops-dashboard):** التذكيرات/التأخير/إعادة الجدولة تُدرج في `core_outbox` فقط إذا كان آخر وارد من المريض داخل النافذة **عند تشغيل المسار**؛ `outbox-drain` يعيد التحقق ويُنهي الصفوف المرفوضة بحالة **`blocked`** (لا تأجيل ولا `pending_reply_coalesce`). ردود `process-inbound` المتزامنة تُرسل عبر مسار `patient_inbound_sync`. `WHATSAPP_KILL_SWITCH=true` يوقف واتساب المريض ولا يوقف تنبيهات الطاقم. المتغيرات: `PATIENT_REPLY_WINDOW_*`، `WHATSAPP_KILL_SWITCH` — انظر `ops-dashboard/README.md`.

**إرسال الجسر:** بالإضافة إلى `MAX_SENDS_PER_MINUTE_PER_CHAT` و`MAX_REPLIES_PER_HOUR_PER_CHAT`، يطبّق الجسر حدّاً إضافياً: **≥ 3 ثوانٍ** بين إرسالين لنفس المحادثة، **≤ 20 رسالة/دقيقة** على مستوى العملية، وتأخير عشوائي **800–2500 ms** قبل الدخول لطابور الإرسال. راقب `/metrics`: `bridge_send_safety_blocked_total`، `bridge_send_safety_jitter_ms_total` (مجموع ميلي ثانية التأخير العشوائي قبل الإرسال).

Then apply n8n workflow patch if you use the bundled file:

```bash
node tools/patch-n8n-multitenant.js
node tools/embed-scheduling-engine-into-workflow.js
```

The embed script copies [tools/scheduling-engine-n8n-code.js](tools/scheduling-engine-n8n-code.js) into the **Scheduling Engine** Code node in [n8n-workflow-whatsapp-local.json](n8n-workflow-whatsapp-local.json) after you edit the JS source.

**From ops-dashboard (Node + `pg`):** same SQL files in order — `npm run db:apply-scheduling` (set `DATABASE_URL` if needed). On an **empty** Postgres database, set `APPLY_CRM_BOOTSTRAP=true` once so `crm-bootstrap.sql` runs first; on an existing CRM DB, omit it and keep only migrations/seeds as in `\i` above.

## 4) Bridge environment

Copy [.env.example](.env.example) to `.env`.

Important keys:

| Variable | Purpose |
|----------|---------|
| `CLINIC_ID` | Default tenant id forwarded to n8n as `clinic_id` (per bridge instance). |
| `N8N_WEBHOOK_URL` | Production webhook URL. |
| `BRIDGE_PORT` | HTTP listen port (default `3100`). |
| `BRIDGE_BIND_HOST` | Listen address. Use **`0.0.0.0`** on a VPS when **ops-dashboard runs in Docker** and probes `host.docker.internal` / deep health — **`127.0.0.1` alone causes connect timeouts** from containers. |
| `N8N_WEBHOOK_HMAC_SECRET` | Shared secret; bridge sends `X-Bridge-Signature: sha256=<hex>` over raw JSON body. Set the same value in n8n env; workflow **Verify Webhook HMAC** enforces it when non-empty. |
| `BRIDGE_SEND_API_TOKEN` | If set, `POST /send` requires `Authorization: Bearer <token>`. |
| `MAX_REPLIES_PER_HOUR_PER_CHAT` | Rate limit per chat for `/send`. |
| `MAX_SENDS_PER_MINUTE_PER_CHAT` | Burst limit per minute per chat. |
| *(built-in)* | **Send safety:** min **3s** between sends to the same `to`, max **20** sends/minute process-wide, **800–2500ms** jitter before queue (see `lib/safety/rateSafety.js`; metrics `bridge_send_safety_blocked_total`, `bridge_send_safety_jitter_ms_total`). |
| `NIGHT_MUTE_START_HOUR` / `NIGHT_MUTE_END_HOUR` | Optional local-hour window where `/send` returns 429. |
| `WA_RECONNECT_INITIAL_MS` / `WA_RECONNECT_MAX_MS` | Backoff bounds for WhatsApp reconnect. |
| `OUTBOUND_QUEUE_FILE` | NDJSON disk queue for outbound jobs that could not be sent after retries. |
| `INBOUND_WEBHOOK_QUEUE_FILE` | NDJSON queue for failed n8n webhook POSTs; drained on bridge heartbeat (see `INBOUND_WEBHOOK_*` in [.env.example](.env.example)). |
| `SEND_MAX_RETRIES` / `SEND_RETRY_BASE_MS` | Exponential backoff for failed sends. |
| `SEND_ACK_TIMEOUT_MS` | How long to wait for WhatsApp `message_ack` before counting a timeout (metrics). |
| `WA_CB_*` | Disconnect circuit breaker: window, threshold, cooldown; delays reconnect when tripped. |
| `WA_REPAIR_CACHE_ON_CIRCUIT` | If `true`, deletes `.wwebjs_cache` when the circuit opens (session auth dir untouched). |
| `MEMORY_WATCHDOG_INTERVAL_MS` / `MEMORY_HEAP_RATIO_WARN` | Heap pressure logging + metrics. |
| `GRACEFUL_SHUTDOWN_MS` | Max wait on in-flight send queue during SIGINT/SIGTERM. |

## 5) Bridge HTTP endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | `{ ok, ready }` — process up + WhatsApp session state. |
| GET | `/ready` | `200` if ready, `503` if not (for load balancers). |
| GET | `/metrics` | Prometheus text metrics (counters + `bridge_ready` gauge). |
| POST | `/send` | Outbound reply (`to`, `text` JSON). Bearer required if `BRIDGE_SEND_API_TOKEN` set. Optional header `X-Correlation-Id` (يُسجَّل في `outbound_send` NDJSON). |

## 6) n8n

1. Import [n8n-workflow-whatsapp-local.json](n8n-workflow-whatsapp-local.json).
2. Attach Postgres credential to: `Audit DLQ`, `Update Conversation State`, `Create Case`, `Log Alert`, `CRM Log Outbound` (and any other SQL nodes). **`CRM Upsert Inbound` is an HTTP call** to ops-dashboard (`OPS_DASHBOARD_URL` + `/api/internal/crm/inbound-ingest`) using `SCHEDULING_SERVICE_TOKEN`.
3. Webhook path: `/webhook/whatsapp`.
4. **HMAC:** set `N8N_WEBHOOK_HMAC_SECRET` on the bridge and the same value in n8n env. The workflow runs **Verify Webhook HMAC** before **Normalize Input**. If the secret is unset in n8n, verification is skipped (dev only).
5. `Send Reply via Bridge` / `Send Urgent Alert` use env **`BRIDGE_SEND_URL`** (default `http://host.docker.internal:3100` in the workflow expression).
6. Add header on HTTP Request node if you enabled `BRIDGE_SEND_API_TOKEN`: `Authorization: Bearer ...`.

**DLQ:** On `CRM Upsert Inbound` failure, execution routes to **Audit DLQ** (inserts `audit_logs`) then **Respond Invalid Payload**.

**Latency:** `workflow_latency_ms` is returned from the inbound-ingest API (same semantics as the former SQL SELECT).

**Bridge retries:** failed webhook POSTs are appended to `INBOUND_WEBHOOK_QUEUE_FILE` (see [.env.example](.env.example)) and retried on the bridge heartbeat until success or max attempts.

## 7) Self-hosted AI (optional)

Module: [lib/ai/selfHosted.js](lib/ai/selfHosted.js) — Ollama `/api/chat` with `format: "json"`. Wire from n8n HTTP Request or a sidecar service. Environment suggestions:

- `OLLAMA_URL=http://127.0.0.1:11434`
- `OLLAMA_MODEL=...` (Arabic-capable model of your choice)

## 8) Google Calendar

See [google-calendar/README.md](google-calendar/README.md) and stub [lib/googleCalendar.js](lib/googleCalendar.js). Implement OAuth + token storage in your Ops API or n8n credentials.

## 9) Ops dashboard

See [../ops-dashboard/README.md](../ops-dashboard/README.md).

- **Node.js:** build the dashboard with **Node 20 LTS** (see `engines` in [../ops-dashboard/package.json](../ops-dashboard/package.json)). **Node 22+** often breaks the bundled `@next/swc-win32-x64-msvc` native binary (`not a valid Win32 application` / load failures).
- **Auth:** JWT cookie (`ops_session`) after `POST /api/auth/login` (bcrypt against `staff_users.password_hash`).
- **Env:** `DATABASE_URL`, `JWT_SECRET` (≥16 chars), `BRIDGE_INTERNAL_URL`, `BRIDGE_SEND_TOKEN` (must match `BRIDGE_SEND_API_TOKEN` on the bridge when token auth is enabled). Optional: `DEMO_MODE=true` (blocks real DB shifts on **Doctor left**), `NEXT_PUBLIC_DEMO_MODE=true` (banner), `PG_POOL_MAX` for connection pool sizing.
- **Seed user (dev):** run [sql/seed-ops-admin.sql](sql/seed-ops-admin.sql) — default password `changeme` for `ops@local.test` (rotate immediately).
- **UI:** live inbox (`/inbox`), conversation thread + human reply via bridge, quick analytics (`/analytics`), secretary board (`/secretary`), doctor queue (`/doctor`). Roles: `secretary`, `doctor`, `admin`, etc.
- **Reminders cron:** `POST /api/internal/scheduling/reminders/due` (Bearer `SCHEDULING_SERVICE_TOKEN`) — optional body `{ "mark_sent": true }` to mark `reminder_sent_at`. Wire from n8n **Schedule Trigger** every few minutes, then loop HTTP to bridge `/send` for each `reminders[].body_ar`.

## 10) Validation matrix (WhatsApp)

Send:

- General text  
- Booking (`حجز` / `موعد`)  
- Pricing (`كم` / `سعر`)  
- Urgent (`طوارئ` / `نزيف` / `اسعاف`)  
- Duplicate same text within dedupe window  
- Message after `REPLY_WINDOW_HOURS` (should block `/send`)

Expected:

- n8n execution succeeds on happy path.  
- Rows in `patients`, `conversations`, `messages` with correct `clinic_id`.  
- Urgent path creates `cases` / `alerts` when configured.  
- `GET /ready` becomes `true` after QR pairing.

## 11) Observability

- Bridge NDJSON: `logs/bridge-events.ndjson`  
- Event types: `bridge_started`, `inbound_received`, `webhook_forwarded`, `webhook_forward_failed`, `outbound_queued`, `outbound_sent`, `send_failure`, `wa_disconnected`, `wa_reconnect_scheduled`, etc.

## 12) Tests (bridge)

```bash
npm test
```

Covers webhook HMAC signing, WhatsApp disconnect **circuit breaker**, and inbound **moderation** heuristics.

## 13) Failure recovery

- Bridge exits or `ready:false`: restart `npm run start:bridge`; watch Chrome window; re-scan QR if session lost.  
- Postgres connection errors from n8n: fix credential host (`host.docker.internal` vs `127.0.0.1`).  
- After schema change: re-import workflow or re-run `node tools/patch-n8n-multitenant.js`.

## 14) Long-run stability (7+ days)

- **Process manager:** run bridge and ops-dashboard under PM2, systemd, or Docker `restart: unless-stopped` with healthchecks (`GET /health`, `GET /ready` on bridge; ops `npm start` behind reverse proxy with upstream checks).  
- **Postgres:** enable autovacuum defaults; monitor disk; nightly `pg_dump` ([scripts/backup-crm.ps1](scripts/backup-crm.ps1)); tune `max_connections` vs app `PG_POOL_MAX`.  
- **Logs:** ship JSON lines from stdout (ops-dashboard logs `component` + `level` on errors) and bridge NDJSON to rotation (e.g. logrotate / Docker logging driver max-size).  
- **WhatsApp:** avoid killing the Chrome session; keep `WA_RECONNECT_*` and circuit-breaker envs from [.env.example](.env.example); watch `bridge_ready` in `/metrics`.  
- **n8n:** Schedule Trigger for reminders every **5 minutes** (aligned with the 27–33 minute reminder window on the server).  
- **First client checklist:** same `SCHEDULING_SERVICE_TOKEN` everywhere; `UPDATE doctors SET staff_user_id = …` for `/doctor`; secretary `staff_users.role = 'secretary'`; migrations + seeds applied; bridge `/send` token aligned with `BRIDGE_SEND_TOKEN`; smoke-test booking + secretary board + one reminder cycle.
