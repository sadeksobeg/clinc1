# دليل تشغيل توجيه واتساب متعدد العيادات (Multi-clinic WhatsApp Routing)

هذا الدليل يغطي تشغيل وصيانة منظومة توجيه واتساب متعدد العيادات: من إعداد رقم جديد، إلى المراقبة اليومية، إلى إجراءات الطوارئ عند حدوث حظر.

---

## 1) المعمارية المختصرة

```
Patient → whatsapp-bridge (host) → ops-dashboard → Postgres
                                       ↓
                                  FSM + DB state
                                       ↑
                            Admin UI: /platform/whatsapp-routing
```

- **`whatsapp-bridge`** — يعمل على المضيف (host)، يستقبل/يرسل عبر `whatsapp-web.js`.
- **`ops-dashboard`** — Next.js داخل Docker، يحوي الحالة (FSM) و APIs الإدارة.
- **`apps/web`** — واجهة الأدمن (super-admin يديرها كاملة، clinic-admin يقرأ تخصصاته فقط).
- **Postgres** — جداول `specialties`، `clinic_specialties`، `doctor_specialties`، `whatsapp_inbound_routes`، `wa_send_audit`، `wa_number_state` (مهاجرة `045_specialty_routing.sql`).

---

## 2) تشغيل أول مرة (Provisioning)

### 2.1 تطبيق المهاجرة

```bash
cd ops-dashboard
DATABASE_URL=postgresql://postgres:****@127.0.0.1:5432/clinicsaas \
  node scripts/apply-scheduling-sql.cjs
```

سترى السطر `Applying: migrations/045_specialty_routing.sql` ثم `OK`.

### 2.2 ضبط متغيرات البيئة للجسر

عدِّل `whatsapp-bridge/.env` (يُنشأ من `.env.example`):

```env
# الأساسيات
BRIDGE_PORT=3100
BRIDGE_BIND_HOST=0.0.0.0
SCHEDULING_SERVICE_TOKEN=<same as ops>
BRIDGE_SEND_API_TOKEN=<random>=24+ chars
N8N_WEBHOOK_URL=http://127.0.0.1:5678/webhook/whatsapp
N8N_WEBHOOK_HMAC_SECRET=<random>

# سياسة منع الحظر (الافتراضات أكثر تحفظًا، عدِّل عند الحاجة فقط)
BRIDGE_SAFETY_MIN_INTERVAL_MS=4000
BRIDGE_SAFETY_MAX_GLOBAL_PER_MIN=15
BRIDGE_JITTER_MIN_MS=1500
BRIDGE_JITTER_MAX_MS=4500
REPLY_MIN_DELAY_MS=1800
REPLY_MAX_DELAY_MS=5500
WA_TYPING_INDICATOR_MS=900

# السقوف اليومية
MAX_REPLIES_PER_DAY_PER_CHAT=60
MAX_SENDS_PER_DAY_GLOBAL=1500
MAX_SAME_TEXT_PER_DAY=200

# كاشف البث (broadcast circuit)
BRIDGE_BROADCAST_WINDOW_MS=600000
BRIDGE_BROADCAST_UNIQUE_CHATS=12
BRIDGE_BROADCAST_PAUSE_MS=300000

# Audit hook (يرسل لـ ops-dashboard)
BRIDGE_AUDIT_ENABLED=true
BRIDGE_AUDIT_ENDPOINT_URL=http://127.0.0.1:3001/api/internal/wa-audit/record
BRIDGE_AUDIT_ENDPOINT_TOKEN=<same as SCHEDULING_SERVICE_TOKEN>

# Alerts
ALERT_WEBHOOK_URL=https://chat.googleapis.com/.../webhook
```

### 2.3 إضافة رقم واتساب جديد

من واجهة المنصة:

1. سجّل دخول كـ super-admin.
2. اذهب إلى **`/platform/whatsapp-routing`** → **أرقام واتساب**.
3. أدخل:
   - **الرقم** — `+9627XXXXXXXX` بالتنسيق الدولي.
   - **ID عيادة Hub** — العيادة الافتراضية لاستقبال المرضى الجدد قبل اختيار التخصص.
   - **IDs العيادات المسموحة** — مثال: `1,2,5` (العيادات التي يمكن توجيه المريض إليها عبر هذا الرقم).
   - **رسالة الترحيب** — اختيارية.
4. أضف.

### 2.4 ضبط التخصصات والأطباء

1. **التخصصات** — تأكد من أن كل التخصصات التي تريد عرضها للمرضى موجودة ومفعّلة.
2. **العيادات × التخصصات** — فعِّل الجداول المناسبة لكل عيادة (المهاجرة تملأ هذا تلقائيًا من بيانات الأطباء الحالية، لكن راجع).
3. **الأطباء × التخصصات** — كل طبيب يربط بتخصصاته (واحد أساسي + فرعية اختيارية).

### 2.5 إعادة تشغيل الجسر

```bash
sudo systemctl restart whatsapp-bridge
sleep 3
ss -tlnp | grep :3100   # يجب أن يكون 0.0.0.0:3100
journalctl -u whatsapp-bridge -n 30
```

---

## 3) المراقبة اليومية

### 3.1 لوحة صحة الرقم

افتح `/platform/whatsapp-routing` → **صحة الرقم**:

- **السقف اليومي العام** — لا تتجاوز 85% (تنبيه تلقائي بعدها).
- **Warm-up** — في أول 7 أيام بعد اقتران رقم جديد، السقوف مقلَّصة (50% يوم 1، 60% يومان 2-3، 80% أيام 4-7).
- **قاطع البث** — يجب أن يكون "نشط" دائمًا. إن أصبح "متوقف" → خطأ في FSM أو رسالة جماعية بدون داعي.
- **آخر 50 رسالة** — راجع أسباب الحجب (blocked_reason).

### 3.2 مقاييس Prometheus

```bash
curl -s http://127.0.0.1:3100/metrics | grep -E 'bridge_(wa_warmup_remaining_days|wa_daily_cap_global_usage|wa_broadcast_circuit_paused|send_blocked_total|broadcast_circuit_trips_total|wa_session_disconnects_total)'
```

أهم الإنذارات:

- `bridge_wa_daily_cap_global_usage > 0.85` → سيُرسل alert تلقائيًا، خفِّف الإرسال أو أضف رقمًا ثانيًا.
- `bridge_broadcast_circuit_trips_total` يزداد → افحص آخر `wa_send_audit` ووجد النص المتكرر.
- `bridge_wa_session_disconnects_total` > 5/ساعة → احتمال مشكلة في حساب واتساب.

### 3.3 سجلات

```bash
tail -F whatsapp-bridge/logs/bridge-events.ndjson | grep -E 'outbound_blocked|broadcast_circuit_trip|wa_disconnect'
```

---

## 4) إجراءات الطوارئ

### 4.1 إيقاف الإرسال الفوري

عند الشك بحظر وشيك أو نشاط غير طبيعي:

1. `/platform/whatsapp-routing` → **التحكم الفوري** → **إيقاف الكل** مع سبب.
2. أو من السطر:
   ```bash
   curl -X POST http://127.0.0.1:3001/api/internal/system/emergency/toggle \
     -H "Authorization: Bearer $SCHEDULING_SERVICE_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"flag":"whatsapp_send_disabled","enabled":true,"reason":"manual_emergency"}'
   ```

### 4.2 تبديل لرقم احتياطي (Backup Number Rotation)

تتطلب التحضير المسبق: نسخة جسر ثانية على المنفذ `3101` مرتبطة برقم احتياطي.

**التحضير المسبق:**

1. انسخ مجلد الجسر إلى `/opt/clinic-os/whatsapp-bridge-backup/`.
2. عدِّل `.env` الاحتياطي:
   ```env
   BRIDGE_PORT=3101
   WA_AUTH_DIR=auth-webjs-backup
   ```
3. أنشئ unit ثانية `whatsapp-bridge-backup.service`.
4. ابدأها واقرن رقمًا احتياطيًا بـ QR.

**عند الحاجة:**

1. أوقف الرقم الأساسي من **التحكم الفوري** → **إيقاف الرقم** (مع سبب).
2. اضغط **تدوير للاحتياطي** على نفس الرقم.
3. في **أرقام واتساب**، عدِّل المسار: غيِّر `to_number` للرقم الاحتياطي أو فعّل صف ثاني تم تجهيزه مسبقًا.
4. حدِّث `BRIDGE_AUDIT_ENDPOINT_URL` لو لزم وأعد تشغيل ops-dashboard.

### 4.3 استعادة بعد حظر مؤقت

1. أوقف الرقم: **إيقاف الرقم** مع سبب `temporary_ban`.
2. انتظر 24-72 ساعة.
3. تأكد من أن السقوف اليومية مضبوطة بشكل تحفظي.
4. **افتح الرقم** بعد التأكد من زوال الحظر.
5. أعد فترة warm-up: حدِّث `paired_at` يدويًا في DB:
   ```sql
   UPDATE wa_number_state SET paired_at = NOW(), updated_at = NOW() WHERE to_number = '+9627XXXXXXXX';
   ```

---

## 5) مؤشرات لوحة العمليات (Daily Cap Dashboard)

ينصح بإنشاء لوحة Grafana مع الـ panels التالية:

| Panel | Query | Alert |
|-------|-------|-------|
| استخدام السقف اليومي | `bridge_wa_daily_cap_global_usage` | > 0.85 لـ 5 دقائق |
| Warm-up أيام متبقية | `bridge_wa_warmup_remaining_days` | تنبيه عند الانتهاء |
| قطوع الاتصال/ساعة | `rate(bridge_wa_session_disconnects_total[1h])` | > 5/ساعة |
| trips قاطع البث | `increase(bridge_broadcast_circuit_trips_total[1h])` | > 0 |
| نسبة الرسائل المحجوبة | `increase(bridge_send_blocked_total[15m]) / increase(bridge_outbound_total[15m])` | > 0.2 |

---

## 6) قائمة فحص قبل الإنتاج

- [ ] مهاجرة `045_specialty_routing.sql` مطبَّقة.
- [ ] `SCHEDULING_SERVICE_TOKEN` متطابق بين الجسر و ops-dashboard.
- [ ] `BRIDGE_AUDIT_ENABLED=true` ولديك صفوف جديدة في `wa_send_audit` بعد كل إرسال.
- [ ] `BRIDGE_BIND_HOST=0.0.0.0` و UFW يسمح لشبكة Compose بالاتصال بـ 3100 (راجع `scripts/ufw-allow-bridge-from-docker.sh`).
- [ ] رقم واتساب واحد على الأقل في `whatsapp_inbound_routes` بـ `is_active=TRUE`.
- [ ] كل عيادة لديها تخصص نشط واحد على الأقل في `clinic_specialties`.
- [ ] كل طبيب نشط لديه صف في `doctor_specialties`.
- [ ] `ALERT_WEBHOOK_URL` يستقبل (اختبر بـ `curl`).
- [ ] لا يتجاوز عدد العيادات في رقم واحد **50 عيادة** (تجنب تجاوز السقف اليومي).
- [ ] تم تجهيز رقم احتياطي وموثَّق ضمن `deploy/`.

---

## 7) معالجة الحوادث (Incident Response)

### حادث: ارتفاع نسبة الرسائل المحجوبة

1. افحص **أسباب الحجب** في `/platform/whatsapp-routing` → **صحة الرقم**.
2. إن كان `daily_cap_global` → السقف اليومي امتلأ. خفِّف الإرسال أو زد السقف (بحذر).
3. إن كان `broadcast_circuit_open` → نص مكرر يصل لـ ≥ 12 محادثة في 10 دقائق. افحص آخر النصوص وأوقف المصدر.
4. إن كان `rate_safety` → الجسر يضيق الإرسال. غالبًا طبيعي تحت ضغط؛ إن استمر، خفِّف `BRIDGE_SAFETY_MAX_GLOBAL_PER_MIN`.

### حادث: ارتفاع disconnects

1. تحقق من `wa_circuit_open_total` في metrics.
2. راجع `journalctl -u whatsapp-bridge` للتفاصيل.
3. إن استمر > 30 دقيقة، اعتبره مؤشر حظر محتمل وانتقل إلى **تبديل لرقم احتياطي**.

### حادث: قاطع البث منعقد بشكل متكرر

1. ابحث في `wa_send_audit` عن أكثر `text_hash` تكرارًا في آخر ساعة:
   ```sql
   SELECT text_hash, COUNT(DISTINCT chat_id) AS chats, COUNT(*) AS sends
   FROM wa_send_audit
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY text_hash ORDER BY chats DESC LIMIT 5;
   ```
2. اربط الـ hash بنص فعلي (ابحث في سجلات الجسر `bridge-events.ndjson` على نفس hash).
3. غالبًا الخطأ في رسالة تذكير جماعية / FSM يرسل قائمة لكل المرضى.

---

## 8) أمان

- **لا تفتح المنفذ 3100 للإنترنت.** UFW يجب أن يحصره على شبكة Compose + 127.0.0.1.
- **`BRIDGE_SEND_API_TOKEN`** ≥ 24 حرف عشوائي.
- **دوِّر التوكنات** عند مغادرة موظف له وصول.
- **PII**: `wa_send_audit` لا يخزن نص الرسالة كاملًا، بل `text_hash` فقط.

---

## 9) ملحقات

- ملف المهاجرة: [whatsapp-bridge/sql/migrations/045_specialty_routing.sql](../whatsapp-bridge/sql/migrations/045_specialty_routing.sql)
- وحدات الحماية: [whatsapp-bridge/lib/safety/](../whatsapp-bridge/lib/safety/)
- واجهة الأدمن: [apps/web/app/(app)/platform/whatsapp-routing/page.tsx](../apps/web/app/%28app%29/platform/whatsapp-routing/page.tsx)
- خطة التصميم الكاملة: `multi-clinic_wa_routing.plan.md`
