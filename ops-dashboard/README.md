# Clinic Ops Dashboard (Next.js)

لوحة عمليات للفريق: صندوق وارد حي من Postgres، محادثة كاملة، رد يدوي عبر جسر واتساب، وتحليلات خفيفة.

## التشغيل المحلي

```bash
cd ops-dashboard
cp .env.example .env.local
# إن كان Postgres على 5435 يحوي قاعدة .NET باسم clinicsaas فقط: أنشئ قاعدة الـ CRM للوحة:
npm run db:provision-local-ops
# ثم اضبط DATABASE_URL في .env.local على .../clinic_ops (يُطبَع السكربت تلميحاً).
# عدّل JWT_SECRET (16+ حرفاً) و BRIDGE_SEND_TOKEN إن كان الجسر يحمي /send
npm install
npm run dev
```

- الواجهة: http://localhost:3001 (بعد الدخول: `/inbox`)
- مستخدم تجريبي: لا تعتمد أي credentials افتراضية. أنشئ/حدّث حساب المشغل يدويًا بكلمة مرور قوية.

## متغيرات البيئة

| المتغير | الوصف |
|---------|--------|
| `DATABASE_URL` | اتصال Postgres (نفس CRM n8n) |
| `JWT_SECRET` | سر توقيع JWT (≥16 حرفاً) |
| `BRIDGE_INTERNAL_URL` | عنوان الجسر من جهة الخادم (مثلاً `http://127.0.0.1:3100`) |
| `BRIDGE_SEND_TOKEN` | نفس `BRIDGE_SEND_API_TOKEN` في الجسر إن فُعّل |
| `WHATSAPP_ROUTING_CLINIC_IDS` | اختياري: قائمة `clinic_id` مفصولة بفواصل لمسار «اختر العيادة» على نفس رقم الواتساب (مثلاً `1,2,3`) |
| `PATIENT_REPLY_WINDOW_MS` أو `PATIENT_REPLY_WINDOW_MINUTES` | نافذة «آخر رسالة واردة من المريض» للاستباقي (تذكير/تأخير/إعادة جدولة): يُنشأ صف واتساب فقط إذا كان آخر وارد ضمن النافذة **عند الإدراج**؛ ويُعاد التحقق عند `outbox-drain`؛ خارج النافذة → **HARD DROP** (`status = blocked`، لا تأجيل ولا دمج) (افتراضي 15 دقيقة) |
| `WHATSAPP_KILL_SWITCH` | إذا `true`: يمنع كل إرسال واتساب **للمريض** (المسارات المتزامنة والاستباقية و`outbox-drain`)؛ **لا** يمنع تنبيهات الطاقم `staff_alert` |
| `REDIS_URL` | اختياري: `redis://host:6379` — عند التعيين يُنشر حدث `InboundMessageRecorded` إلى Redis Stream بعد تخزين الوارد (انظر [docs/WORKER_SPLIT.md](../docs/WORKER_SPLIT.md))؛ وقفل الطابور الوارد + الطوابير (انظر [docs/REDIS_INBOUND_QUEUE_OPS.md](../docs/REDIS_INBOUND_QUEUE_OPS.md)) |
| `INBOUND_PROCESSING_SHARDS` | عدد قوائم `inbound:processing:{shard}` للرؤية (افتراضي `8`) |
| `INBOUND_WORKER_SHARD_START` / `INBOUND_WORKER_SHARD_END` | اختياري: نطاق شاردات يملكها هذا الـ worker (0..N-1) لتشغيل عدة عمليات بدون تضارب على نفس القائمة |
| `INBOUND_FAIR_PATTERN` | اختياري: نمط الجدولة العادلة، مثل `1,1,2,1,2,3` (1=عالي،2=عادي،3=منخفض) |
| `INBOUND_INTERPRET_FAST_PATH` | اضبط `false` لتعطيل مسار التفسير السريع (بدون Ollama عند `flow_step=idle` وغير URGENT) |
| `INBOUND_CONV_CTX_CACHE` | اضبط `0` لتعطيل كاش Redis لسياق المحادثة (`conv:ctx:…`) |
| `INBOUND_CONV_CTX_CACHE_TTL_SEC` | TTL لكاش السياق (افتراضي `45`) |
| `REDIS_EVENTS_STREAM` | اسم الـ stream (افتراضي `ops:events:inbound`) |
| `REDIS_CONSUMER_GROUP` | مجموعة المستهلكين لقياس `pending_count` في `GET /api/system/health/deep` (افتراضي `ops-core`) |
| `HEALTH_DEEP_TOKEN` | اختياري: Bearer إضافي لمسار `GET /api/system/health/deep`؛ يُقبل أيضاً `SCHEDULING_SERVICE_TOKEN` إن وُجد |
| `WHATSAPP_OPS_SEND_MAX_PER_WINDOW` | حد إرسال عبر الجسر لكل نافذة زمنية للعملية (افتراضي `10`) — انظر `lib/messaging/globalSendThrottle.ts` |
| `WHATSAPP_OPS_SEND_WINDOW_MS` | عرض النافذة بالمللي ثانية (افتراضي `1000`) |
| `OPS_WHATSAPP_PRIMARY_HANDLER` | اضبطه `ops` لتثبيت inbound production على ops-dashboard ومنع الازدواجية مع .NET |
| `SYSTEM_MODE` | اختياري: يُسجَّل عند تشغيل الخادم (`instrumentation.ts`)، مثلاً `production` — لا يغيّر السلوك بعد إلا إذا رُبط لاحقاً بمزايا تجريبية |
| `ALERT_WEBHOOK_URL` | اختياري: عند تجاوز عتبة `dead_letter_events` في آخر 5 دقائق، يُرسل `POST` JSON من مسار `health/deep` (قلّل تكرار الاستدعاء لتجنب إزعاج الويبهوك) |
| `DEAD_LETTER_ALERT_THRESHOLD` | عدد صفوف `dead_letter_events` في 5 دقائق لتفعيل `degraded` + الويبهوك (افتراضي `5`) |
| `REPLY_WINDOW_DEFER_MINUTES` | (قديم) لم يعد يُستخدم لتأجيل الصفوف؛ أبقِه فارغاً أو تجاهله |

## سياسة Reactive + Reply-only (واتساب للمريض)

- **رد متزامن مع وارد:** `POST /api/internal/conversations/process-inbound` يُرسل رد المريض في نفس دورة الطلب (بعد تسجيل الرسالة في `messages`)؛ يمر عبر بوابة `patient_inbound_sync` (يُسمح ما لم يُفعّل kill switch).
- **استباقي:** التذكيرات/التأخير/إعادة جدولة الطبيب تُدرج في `core_outbox` **فقط** إذا كان آخر وارد من المريض داخل النافذة وقت تشغيل المسار (cron). عند `outbox-drain`: إن خرجت النافذة أو فشل التحقق → الصف يصبح **`blocked`** (HARD DROP) — **بدون** `pending_reply_coalesce` و**بدون** إعادة جدولة لاحقة في الصندوق.
- **`patient_reply` في الصندوق:** يجب أن يحمل `payload` الحقول `patient_id`، `conversation_id`، `last_inbound_at`؛ وإلا يُحظر الصف.
- **تنبيهات `urgent_alert`:** لرقم الطاقم؛ لا تخضع لنافذة المريض ولا لـ kill switch على مسار التنبيه.
- **بث/حملات:** غير مدعومة؛ أنواع غير معروفة أو تسويقية → `blocked`.

**`core_outbox` + `POST /api/internal/jobs/outbox-drain` (ملخص السلوك — انظر `lib/outbox/coreOutbox.ts`):**

| الحالة | متى |
|--------|-----|
| `sent` | نجاح الإرسال عبر الجسر. |
| `blocked` | HARD DROP / سياسة: بادئات مثل `kill_switch`، `no_last_inbound`، `outside_reply_window`، `policy_blocked` في `last_error`؛ أو نوع وظيفة غير مدعوم. |
| `failed` | خطأ تشغيلي (مثلاً رفض الجسر) مع `attempts < 25`؛ يُعاد الجدولة بـ `available_at` backoff أسي مُحدود. |
| `dead` | `attempts >= 25` بعد فشل إرسال؛ أو مسار `blocked` بدون عمود `blocked` في القاعدة (fallback `dead` + `blocked_fallback:`). |

**قاعدة البيانات:** بعد `004_core_outbox_dialogue.sql` طبّق `005_core_outbox_blocked_status.sql` لإضافة حالة `blocked` إلى `core_outbox.status`. بدونها قد يُسجَّل الصف كـ `dead` مع بادئة `blocked_fallback:`.

**تطبيق الهجرات على الإنتاج/المرحلة:**

- **قاعدة بها جدولة لكن بدون `core_outbox` بعد:** من `ops-dashboard` شغّل `npm run db:apply-core-outbox` (يطبّق `004` ثم `005`). يتطلّب وجود جدول `clinics`.
- **قاعدة بها `core_outbox` من `004` فقط:** `npm run db:apply-outbox-blocked` (يطبّق `005` فقط).
- **تثبيت جديد مع `npm run db:apply-scheduling`:** يُطبَّق الآن `004` و`005` تلقائياً بعد البذور (مع `APPLY_CRM_BOOTSTRAP=true` عند الحاجة).

```bash
cd ops-dashboard
export DATABASE_URL="postgresql://USER:PASS@HOST:PORT/DBNAME"   # PowerShell: $env:DATABASE_URL="..."
npm run db:apply-core-outbox
# أو إن وُجد core_outbox بالفعل:
npm run db:apply-outbox-blocked
```

يدوياً بـ `psql`: `\i whatsapp-bridge/sql/migrations/004_core_outbox_dialogue.sql` ثم `\i .../005_core_outbox_blocked_status.sql`

**بوابة الجسر:** طلبات `POST …/send` من خادم ops-dashboard تخرج من `lib/bridgeSend.ts` فقط (سياسة مركزية + رمز مميز). يُمرَّر `X-Correlation-Id` من الرؤوس عند توفره (تتبع مع `correlation_id` في ردّ `process-inbound`).

**مراقبة خفيفة:** `GET /api/internal/metrics/product` (Bearer `SCHEDULING_SERVICE_TOKEN`) — عدادات منتج + سياسة واتساب في الذاكرة.

**Deep health (اعتماديات + تخلف الـ stream):** `GET /api/system/health/deep` — Bearer `HEALTH_DEEP_TOKEN` و/أو `SCHEDULING_SERVICE_TOKEN`. يتحقق من Postgres وRedis (`PING` + `XREVRANGE`/`XINFO GROUPS`) وجسر `GET /ready` ويعيد `lag_ms` و`stream_lag_ms` و`pending_count` و`dead_letter_events_5m` و`dead_letter_spike` (يتطلب هجرة `008_dead_letter_events.sql`).

**قبل الإطلاق:** `npm run ops:go-live-preflight` (يتطلب `OPS_BASE_URL` + توكن) — انظر [`docs/E2E_PRODUCTION_TEST_RUNBOOK.md`](../docs/E2E_PRODUCTION_TEST_RUNBOOK.md) قسم *Final Go-Live Protocol*.
  
**بوابات Sprint 72h:**  
- Day 2 Pilot: `npm run ops:pilot-day2`  
- Day 3 Soft launch: `npm run ops:soft-launch-day3`

**n8n pre-launch (سريع):**  
- Env sanity: `npm run ops:n8n:env-sanity`  
- Backup workflows: `npm run ops:n8n:backup-workflows`  
- Smoke critical flows: `npm run ops:n8n:smoke-critical-flows`

**SLO داخلي (مقترح):** الجسر `GET /ready` = 200؛ `outbox-drain` لا يعيد 500 متكرراً؛ فشل ويبهوك n8n يُرصَد في الجسر (`bridge_webhook_forward_fail_total`). راجع [whatsapp-bridge/RUNBOOK.md](../whatsapp-bridge/RUNBOOK.md).

**أحداث مجال:** بعد `006_domain_events.sql` — `npm run db:replay-events -- --conversation=<id>`. إدراج `InboundMessageRecorded` تلقائي مع الوارد غير المكرر.

## Docker

من جذر المستودع (مع ملف `.env.prod` يحدد المتغيرات المطلوبة في `docker-compose.prod.yml`):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build ops-dashboard
# consumer اختياري (Phase A — fan-out فقط، يحتاج DATABASE_URL + هجرات 007/008):
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build event-consumer
```

## تجزئة كلمة مرور مستخدم جديد

```bash
npm run hash-password -- "your-password"
```

ثم حدّث `staff_users.password_hash` في SQL.

## محرك الحجز (Clinic Scheduling Engine)

- **مسارات داخلية (Bearer `SCHEDULING_SERVICE_TOKEN`)**:  
  `POST /api/internal/conversations/process-inbound` (مسار موحّد: تطبيع + CRM + قرار الحجز + حالة الحوار + إرسال عبر الجسر) ·  
  `POST /api/internal/trial/signup` (إنشاء clinic + trial subscription + admin + welcome hooks) ·  
  `POST /api/internal/jobs/outbox-drain` (تفريغ `core_outbox`؛ **reactive + HARD DROP** — صفوف خارج السياسة تُنهى بـ `blocked`؛ يحدّث `reminder_sent_at` بعد إرسال ناجح) ·  
  `POST /api/internal/scheduling/late-due` (مواعيد تأخرت + تنبيه واتساب عبر `core_outbox`) ·  
  `POST /api/internal/crm/inbound-ingest` (ما زال متاحاً للمسارات القديمة) ·  
  `POST /api/internal/scheduling/interpret` · `POST .../slots` · `POST .../confirm` · `POST .../manual` · `PATCH .../appointments/[id]` · `POST .../doctor-left` · `POST .../mark-late` · `POST .../reminders/due` · `GET .../clinics` · `POST .../route-clinic`  

  **جدولة cron (مقترح):** تذكيرات + متأخرون كل **~1 دقيقة**؛ تفريغ الـ outbox كل **5–15 ثانية** حسب الحمل مع مراعاة حدود الجسر (انظر `whatsapp-bridge/RUNBOOK.md`).

- **واجهات**: `/secretary` (صلاحية `secretary` أو `admin`) — جلسة المتصفح: `POST /api/secretary/manual`، `POST /api/secretary/appointments/[id]/cancel`، `POST /api/secretary/appointments/[id]/reschedule` (جسم JSON `{ "starts_at": "<ISO>" }`)، إلخ. `/doctor` (صلاحية `doctor` أو `admin` — يتطلب ربط `doctors.staff_user_id`).
- **n8n**: عقدة **Scheduling Engine** في `whatsapp-bridge/n8n-workflow-whatsapp-local.json` تستدعي الـ API أعلاه (متغيرات `OPS_DASHBOARD_URL` و `SCHEDULING_SERVICE_TOKEN` على حاوية n8n).
- **Billing reminders automation**: تمت إضافة خدمة `billing-reminders-job` في `docker-compose.prod.yml` و`docker-compose.clinic.yml` لتشغيل دوري يستدعي:
  `POST /api/internal/billing/reminders/run` كل `BILLING_REMINDER_INTERVAL_SECONDS` (افتراضي 900 ثانية = 15 دقيقة).  
  تتطلب `SCHEDULING_SERVICE_TOKEN` صالح.

## دمج المنتج الرئيسي

يمكن لاحقاً دمج نفس الـ API أو الاستعلامات في `ClinicSaaS`؛ هذه الحزمة تبقى نقطة انطلاق مستقلة للعمليات والمراقبة.

## استكشاف أخطاء `npm install` (Windows)

إذا ظهرت تحذيرات `TAR_ENTRY_ERROR` / `EPERM` أثناء تثبيت `next`، غالباً بسبب **مسار يحتوي على مسافات** أو قفل من برنامج مكافحة فيروسات. جرّب استنساخ المستودع في مسار قصير بدون مسافات، أو شغّل `npm install` من **WSL**، ثم أعد `npm run build`.
