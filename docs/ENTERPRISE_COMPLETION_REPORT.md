# تقرير إكمال الطبقة المؤسسية (Enterprise completion)

تاريخ المرجع: 2026-04-18

## ما تم تنفيذه

### جسر واتساب (`whatsapp-bridge`)

- **Circuit breaker** لقطع الاتصال المتكرر مع نافذة زمنية وتبريد، مع خيار مسح `.wwebjs_cache` عند الفتح (`WA_REPAIR_CACHE_ON_CIRCUIT`).
- **طابور إرسال على القرص** (`OUTBOUND_QUEUE_FILE`) للمهام التي فشلت بعد إعادة المحاولات.
- **إعادة محاولات إرسال** مع backoff، وتتبع **ACK** عبر `message_ack` ومهلة `SEND_ACK_TIMEOUT_MS`.
- **Memory watchdog** يسجل ضغط الذاكرة ويرسل أحداثاً إلى سجل الأحداث والمقاييس.
- **إيقاف تشغيل أنيق**: انتظار محدود لطابور الإرسال (`GRACEFUL_SHUTDOWN_MS`) مع `Promise.race` على `sendQueue`.
- **مقاييس** إضافية (إعادة المحاولة، فتح الدائرة، ضغط الذاكرة، ACK، عمر أقدم رد وارد إن وُجد في الكود).
- **وحدات AI مساعدة**: `lib/ai/moderation.js`، `lib/ai/bookingExtract.js` (دمج n8n اختياري عبر Code node).

### قاعدة البيانات

- **Migration 002** (`sql/migrations/002_enterprise_layer.sql`) + **bootstrap** محدّث لحقول المرضى/المواعيد/القضايا والموظفين (`password_hash`، فهارس، قيود منطقية حيث ينطبق).
- **Migration 003 — Clinic Scheduling Engine**: `doctors`, `doctor_working_hours`, `doctor_leaves`, توسيع `appointments` (طبيب، تخصص، طابور، idempotency، إلخ)، `notification_outbox`, `reschedule_logs`, `clinic_day_queue_state`, عمود `conversations.routing` لاختيار العيادة، أدوار `secretary` / `doctor` في `staff_users`. ملفات: `sql/migrations/003_clinic_scheduling.sql`, `003_clinic_scheduling.down.sql`, `sql/seed-scheduling-demo.sql`.

### لوحة العمليات (`ops-dashboard`)

- **Tailwind** + واجهة RTL أساسية.
- **JWT في cookie httpOnly** + تسجيل دخول عبر `staff_users` و **bcrypt**.
- **API**: صندوق وارد حي (استعلام Postgres)، محادثة + رسائل، إغلاق محادثة، رد يدوي عبر `POST` إلى جسر `/send`.
- **صلاحية viewer**: قراءة فقط (بدون رد ولا إغلاق).
- **Dockerfile** + `output: 'standalone'` للنشر مع `docker-compose.prod.yml`.
- **محرك الحجز (Scheduling API)** تحت `/api/internal/scheduling/*` مع `SCHEDULING_SERVICE_TOKEN`: interpret (Ollama اختياري + heuristics)، slots، confirm، manual، PATCH موعد، doctor-left، mark-late، reminders/due، قائمة عيادات، تعيين `routing` للمحادثة.
- **واجهات**: `/secretary` (يوم، حجز يدوي، خروج طبيب)، `/doctor` (دور اليوم + إجراءات) مع APIs تحت `/api/secretary/*` و `/api/doctor/*`.
- **اختبارات وحدة** (Vitest): `lib/scheduling/availabilityEngine.test.ts`.

### جسر التدفق n8n

- عقدة **Scheduling Engine** بعد CRM غير المكرر: تستدعي ops-dashboard (interpret + slots) وتبني `finalReply` للحجز.

### DevOps / توثيق

- **`docker-compose.prod.yml`**: Postgres + n8n + ops-dashboard مع متغيرات بيئة إلزامية واضحة.
- **`deploy/nginx/clinic.conf.example`**: مثال TLS و `proxy_pass` لـ ops و n8n.
- **`docs/ZERO_DOWNTIME_DEPLOY.md`**: خطوات عملية وحدود الجسر (جلسة واتساب واحدة لكل رقم).
- **`sql/seed-ops-admin.sql`**: مستخدم تجريبي للوحة (`ops@local.test` / `changeme`).
- **RUNBOOK** و **`.env.example`** للجسر محدّثان بمتغيرات الطبقة المؤسسية.

## ما يمكن إكماله لاحقاً

- اختبارات تكامل **end-to-end** ضد Postgres حقيقي وواجهات ops (حالياً: اختبارات وحدة للجسر حيث وُجدت).
- ربط **moderation / bookingExtract** داخل سير n8n بشكل رسمي (عقد HTTP أو Code).
- **RLS** أدق على مستوى العيادة في Postgres إذا لزم العزل البرمجي داخل قاعدة واحدة.
- **مراقبة مركزية** (Grafana/Loki) بدل Prometheus نصي فقط.

## التشغيل السريع

1. `docker compose -f docker-compose.clinic.yml up -d` (تطوير) أو `docker-compose.prod.yml` مع ملف `.env.prod`.
2. تطبيق SQL: `crm-bootstrap.sql` أو الهجرات بالترتيب.
3. `sql/seed-ops-admin.sql` ثم `003_clinic_scheduling.sql` و `seed-scheduling-demo.sql`؛ ضبط `ops-dashboard/.env` من `.env.example` بما فيه **`SCHEDULING_SERVICE_TOKEN`** (نفس القيمة في متغيرات n8n في Docker).
4. تشغيل الجسر وتعيين `BRIDGE_SEND_API_TOKEN` مطابق لـ `BRIDGE_SEND_TOKEN` في لوحة العمليات.
5. ربط الطبيب بحساب الدخول: `UPDATE doctors SET staff_user_id = <staff_users.id> WHERE id = ...` ليظهر `/doctor`.
