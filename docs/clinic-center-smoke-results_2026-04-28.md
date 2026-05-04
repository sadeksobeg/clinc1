## Smoke Results — 2026-04-28

> هذا الملف يحتوي الآن على **تشغيل اختبارات واقعية عبر process-inbound** (محاكاة واتساب) بعد تشغيل Postgres ورفع الخدمات.

### 0) Build / Typecheck
- **Result**: PASS
- **Evidence**: `apps/web` build يمر بنجاح بعد تغييرات Phase1–Phase3 (No fake data + timezone + inbox virtualization).

### Environment readiness
- **apps/web**: `http://127.0.0.1:3000` → **200**
- **ops-dashboard**: `http://127.0.0.1:3001` → **Ready** + `/api/internal/system/health` → **200**
- **whatsapp-bridge**: `http://127.0.0.1:3101/ready` → `{\"ok\":true,\"ready\":true}`
- **Postgres**: port **5435** → **LISTEN**

### 1) الإعدادات (/settings)
- **Expected**:
  - لا تظهر قيم افتراضية كبيانات فعلية قبل التحميل.
  - حفظ ساعات العيادة/دوام الطبيب ينعكس عند إعادة الفتح.
- **Status**: CODE-PASS (يتطلب تحقق يدوي على بيئتك)
- **Notes**:
  - تم إضافة `isInitialLoading` + إزالة defaultValues النصية.
  - ساعات العيادة لا تُعرض إلا بعد تحميل API.

### 2) المرضى (/patients و /patients/[id])
- **Status**: CODE-PASS (سلوك ثابت في الكود)
- **Notes**:
  - رقم واتساب مشتق من `chat_id` عبر `extractWhatsAppDigits`.
  - صفحة المريض تعرض هوية واتساب + أزرار نسخ + فتح المحادثة (إن توفر `last_conversation_id`) + إنشاء موعد (prefill).

### 3) صندوق الوارد (/inbox)
- **Status**: CODE-PASS
- **Notes**:
  - إزالة `clinic_id` الثابت كانت منجزة سابقًا.
  - إضافة virtualization لرسائل المحادثة لتجنب انهيار الأداء مع threads طويلة.

### 4) المواعيد (/appointments)
- **Status**: CODE-PASS
- **Notes**:
  - تحويل `datetime-local` أصبح timezone-aware باستخدام `clinicTimezone` (Luxon) قبل الإرسال.
  - grid أصبح يعتمد على ساعات الطبيب (إذا موجودة) وإلا fallback لساعات العيادة.

### 5) الأطباء (/doctors)
- **Status**: CODE-PASS
- **Notes**:
  - لا يوجد أسماء أطباء مخترعة؛ يعتمد على `fetchDoctorsRows`.

### 6) التحليلات (/analytics)
- **Status**: CODE-PASS
- **Notes**:
  - تجميع الأيام أصبح timezone-aware.
  - في حال فشل metrics أو appointments تظهر “غير متاحة” بدل أرقام مضللة.

### 7) الدعم (/support)
- **Status**: CODE-PASS
- **Notes**:
  - error state عربي واضح + سبب التصعيد إلزامي.

### 8) مركز الذكاء الاصطناعي (/ai-center)
- **Status**: CODE-PASS
- **Notes**:
  - `OLLAMA_MODEL` إذا غير مضبوط → “غير محدد”.

---

## Operational validation (Real clinic flows)

### Scenario 1 — WhatsApp → Inbox → Booking (E2E via `process-inbound`)
**Chat ID**: `201111222333@c.us` — **Clinic**: 1 — **Conversation**: 3 — **Patient**: 11

1) **Inbound**: \"مرحبا\"
- **Expected**: إنشاء/تحديث محادثة + رد عام + ظهورها في Inbox.
- **Actual**: PASS
  - `finalIntent=GENERAL`
  - `reply_text=تم استلام رسالتك...`
  - ظهرت المحادثة في `/api/internal/inbox` ضمن الصف الأول.

2) **Inbound**: \"أريد حجز موعد\"
- **Expected**: intent booking + سؤال جمع بيانات (اسم/طبيب/وقت).
- **Actual**: PASS
  - `finalIntent=BOOKING`
  - `reply_text=يرجى إرسال الاسم الكامل...`

3) **Inbound**: \"محمد أحمد\" (الاسم)
- **Expected**: عرض slots فعلية متأثرة بساعات الطبيب/العيادة.
- **Actual**: PASS
  - تم عرض 3 مواعيد (4:00/4:15/4:30 م) بصيغة عربية.

4) **Inbound**: \"1\" (تأكيد الخيار الأول)
- **Expected**: INSERT appointment + ظهور الموعد في `/appointments` و`/dashboard`.
- **Actual**:
  - **Before fix**: FAIL (Critical) — تم تأكيد موعد “ماضٍ” (٤:٠٠ م) ولم يظهر في `upcoming`.
  - **After fix**: ✅ PASS — تم إصلاح فلترة الـ slots لمنع اقتراح أوقات ماضية.
    - Re-run على Chat جديد `201111223333@c.us`:
      - تم تأكيد الحجز على موعد **مستقبلي** (٦:٠٠ م).
      - ظهر الموعد فعليًا في `GET /api/internal/appointments/upcoming?clinic_id=1` مع `source_channel=whatsapp`.

### Scenario 2 — تعديل الموعد (Reschedule/Cancel)
- **Reschedule**: `PATCH /api/internal/scheduling/appointments/12` → PASS
- **Cancel**: `PATCH /api/internal/scheduling/appointments/12` status=cancelled → PASS

### Scenario 3 — ضغط رسائل (High load)
- إرسال 30 رسالة inbound خلال ~1.3s إلى `process-inbound` → PASS (30/30 OK)

### Scenario 6 — طوارئ + تخصيص موعد
- **Inbound**: \"عندي حالة طارئة صعوبة تنفس\"
- **Actual**: PASS
  - `finalIntent=EMERGENCY`, `finalPriority=1`
  - تم تخصيص موعد طارئ وظهر في inbox ضمن `routing.last_emergency_event` مع `appointment_id=13`.
  - ملاحظة: `urgent_alert_sent=false` لأن قناة التنبيه/الهدف غير مفعّلة في الإعدادات الحالية (متوقع في بيئة local).

### Scenario 4 — Edge cases (Input robustness)
- **اسم غير طبيعي / قصير**:
  - \"بدون\" → تم قبوله كاسم (PASS وظيفيًا، لكن يُفضل تحسين سياسة قبول الأسماء لاحقًا).
  - \"محمد\" في نفس التدفق بعد قبول اسم سابق → أعاد reprompt (PASS).
- **Pagination**:
  - \"مواعيد أخرى\" → أعطى صفحة جديدة من slots (PASS).
- **Free-text time**:
  - \"غداً الساعة 3\" → تم تفسيرها كاختيار slot من القائمة بناءً على الوقت المتاح (PASS من ناحية parsing/flow).

