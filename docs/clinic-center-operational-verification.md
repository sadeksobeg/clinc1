## Clinic Center Operational Verification (E2E)

هدف هذا المستند: **تحقق تشغيلي end-to-end** أن إعدادات العيادة + دوام الطبيب تنعكس فعليًا على واتساب/الجدولة/الطوارئ/التنبيهات، بدون الاعتماد على بيانات وهمية.

### 1) مسار واتساب end-to-end (مصدر الحقيقة)
- **Inbound**: `whatsapp-bridge` → يرسل payload إلى `ops-dashboard` (مع `clinic_id`, `from`, `text`, …).
- **Core processing**: `ops-dashboard/lib/conversations/processInbound.ts`
  - يمنع الرد الآلي إذا كانت الفوترة مقفلة عبر `canClinicAutoReply` (Local Billing Lock).
  - يقرر طوارئ/حجز/أسئلة عامة، ثم يرسل الرد عبر `sendPatientWhatsAppGuarded`.
- **Routing clinic**: البحث عن الساعات/المواعيد يأخذ بعين الاعتبار `routing.selected_clinic_id` إن كانت موجودة على المحادثة.

### 2) الجدولة: كيف تؤثر “ساعات الطبيب/العيادة” على اقتراح المواعيد
مصدر اقتراح المواعيد (slots):
- `ops-dashboard/lib/scheduling/slotService.ts` → `findNextSlots(...)`

قواعد العمل:
- **الأساس**: إذا كانت `doctor_working_hours` معرفة للطبيب، فهي التي تتحكم بالدوام والاقتراح.
- **Fallback مضبوط**:
  - إذا لم تُعرّف ساعات الطبيب بعد، يستخدم `clinic_public_hours` (ساعات العيادة) إن كانت موجودة.
  - إذا كانت ساعات العيادة غير معرفة أيضًا، يوجد fallback افتراضي واسع لتجنب “dead-end” في واتساب.

نقطة تحقق سريعة (قاعدة بيانات/منطق):
- `doctor_working_hours` هي المصدر الأهم عندما تكون معرفة.
- `clinic_public_hours` يجب أن تطابق ما يُحفظ من واجهة الإعدادات.

### 3) إعدادات العيادة: الحفظ/التحميل وتوثيق الأثر
حفظ/تحميل إعدادات العيادة يتم عبر:
- Internal API: `ops-dashboard/app/api/internal/clinics/[id]/settings/route.ts`
  - يكتب `clinic_public_hours` (DELETE ثم INSERT).
  - يحدث `clinics.metadata` (مثل holidays) عند الحاجة.
  - يكتب Audit log: `clinic.settings.patch`.

في `apps/web` يتم الوصول عبر BFF:
- `apps/web/app/api/ops/clinic-settings/route.ts` → upstream internal API.

### 4) الطوارئ (Emergency) + الإشعارات
- قرار الطوارئ يتم داخل:
  - `ops-dashboard/lib/scheduling/emergencyDecisionEngine.ts` (يُستدعى من `processInbound`).
- “الحالة التشغيلية” العامة يجب أن تُقرأ من:
  - `apps/web/app/api/ops/system/health/deep/route.ts` (ثم تُعرض بالواجهة).

### 5) خطوات تحقق عملية (Smoke) عبر الواجهة
- **ساعات العيادة**: من `/settings` غيّر ساعات اليوم الحالي → احفظ → أعد فتح الصفحة وتأكد من بقاء القيم.
- **ساعات الطبيب**: من `/settings` (تبويب الأطباء) عدّل ساعات طبيب → احفظ → أرسل رسالة حجز في واتساب وتأكد أن الاقتراحات تغيرت.
- **حجز واتساب**:
  - رسالة: "أريد موعد" → يجب أن يعرض خيارات أوقات.
  - اختيار: رقم/نص/وقت (مثل "٥م" أو "17:00") → يجب أن يفهمها التدفق.
- **طوارئ واتساب**: رسالة تحمل مؤشرات طوارئ → يجب أن يظهر تصعيد/وسم واضح في السجل/المحادثة.
- **Billing lock**: اجعل حالة الفوترة مقفلة (إن كان لديك طريقة إدارية) → يجب أن يتوقف الرد الآلي ويرسل رسالة واضحة للمريض.

### 6) أوامر اختبار (اختياري – للـ Dev)
ملاحظة: هذه الأوامر تتطلب جلسة/توكنات صالحة حسب بيئتك.

```bash
# Health (deep)
curl -sS "http://localhost:3000/api/ops/system/health/deep"

# Clinic settings (via BFF)
curl -sS "http://localhost:3000/api/ops/clinic-settings"

# Doctors list (via BFF)
curl -sS "http://localhost:3000/api/ops/doctors"
```

