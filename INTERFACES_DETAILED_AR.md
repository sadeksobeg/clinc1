# دليل الواجهات التفصيلي (الإصدار المعتمد)

هذا المرجع يصف الشكل التشغيلي النهائي للنظام بعد اعتماد معمارية:
- `PlatformAdmin` واحد للمنصة.
- داخل العيادة: `Receptionist` و`Doctor` فقط.
- لا توجد مساحة `Clinic Admin`.

## 1) App Shell

- هيدر موحّد لكل الصفحات.
- روابط عامة: `/`, `/features`, `/pricing`, `/demo`, `/contact`.
- بعد تسجيل الدخول:
  - زر اللغة `AR/EN`.
  - زر `Dashboard`.
  - زر `Logout`.
  - روابط `Analytics` و`Communications` لمستخدمي العيادة.
  - رابط منصة لـ`PlatformAdmin` فقط.
  - رابط اشتراك الطبيب لـ`Doctor` فقط.
- Toast سفلي لرسائل النجاح/الخطأ.

## 2) Redirect Contract بعد الدخول

- `PlatformAdmin` -> `/platform/overview`
- `Receptionist` -> `/clinic/reception`
- `Doctor` -> `/clinic/doctor`
- غير موثق -> `/login`

## 3) Public Site (Marketing)

### `/`
- Above the fold: عنوان قيمة واحد + CTA رئيسي + CTA ثانوي.
- تحت الطي: 3 مزايا، لماذا نحن، Pricing teaser، FAQ، Footer.

### `/features`
- 4-6 ركائز فقط.
- كل ركيزة: عنوان + أثر تشغيلي (لا شرح تقني).

### `/pricing`
- جدول خطط واضح + Add-ons + CTA طلب Demo.
- إظهار القيود بوضوح (لا إخفاء).

### `/demo`
- نموذج قصير: الاسم، العيادة، الهاتف، البريد، الملاحظات.
- رسالة نجاح واضحة بعد الإرسال.

### `/contact`
- قناتا اتصال واضحتان: مبيعات + دعم.
- وقت الرد وسياسة المتابعة.

### `/login`
- تسجيل دخول بسيط بالـTenant context.
- عرض حسابات التطوير المعتمدة (PlatformAdmin / Receptionist / Doctor).

## 4) Platform Console

### `/platform/overview`
- KPIs تنفيذية: Active Clinics, Pending Subscriptions, MRR, ARPU, Churn Proxy.
- تنبيه صحة واضح + أزرار انتقال سريعة.

### `/platform/clinics`
- جدول عيادات كامل + بحث + فلاتر + إجراءات سريعة.
- إنشاء عيادة، تفعيل/تعطيل، تدوير webhook secret، دخول tenant context.
- لوحة طلبات اشتراك مع موافقة/رفض.

### `/platform/subscriptions`
- قائمة طلبات اشتراك مع Panel تفاصيل.
- كل طلب يعرض: الخطة، القناة، الدورة، السعر، طريقة الدفع، مرجع الدفع.
- قرارات:
  - Approve (مع تأكيد طريقة الدفع `Cash` أو `ShamCash`).
  - Reject (مع سبب).
- SLA: بعد تأكيد الدفع يتم التفعيل خلال ساعتين كحد أقصى.

### `/platform/billing`
- مركز مالي: فواتير، الحالة، تواريخ الاستحقاق، مدفوع/معلق/متأخر.
- `mark paid` + تصدير.

### `/platform/audit`
- tenant selector + timeline أحداث حساسة.
- أمثلة: approve/reject/login/edit/cancel/mark paid/webhook failures.

### `/platform/health`
- API health + worker health + queue health + db health + alerts.

## 5) Clinic Workspaces

### `/clinic/reception` (Operations Desk)
- 3 مناطق: قائمة/جدول/تفاصيل.
- وظائف: جدول اليوم، الانتظار، walk-in سريع، تعديل الحالة، تأخير الطبيب، بحث المرضى.
- حالات إلزامية: loading, empty, error, offline, conflict.

### `/clinic/doctor` (Clinical Workflow)
- Top strip KPIs خفيف.
- قائمة اليوم + queue head + إجراءات ثابتة (completed/no-show).
- Right rail لملخص الحالة المختارة.

### `/clinic/doctor/billing` (Doctor Subscription Request)
- الطبيب يختار خطة + add-ons + `PaymentMethod` (`Cash` أو `ShamCash`) + مرجع الدفع.
- الإجراء الوحيد: **إرسال طلب** إلى `PlatformAdmin`.
- لا توجد موافقة ذاتية للطبيب.
- Timeline لحالة الطلب (Submitted -> Approved/Rejected).
- رسالة توضيحية: التفعيل خلال ساعتين بعد تأكيد الدفع.

## 6) Communications Module

### `/clinic/communications`
- صفحة بوابة: Conversations / Campaigns / Templates.

### `/clinic/communications/conversations`
- تصميم Inbox: قائمة + تفاصيل + composer.
- بحث، فلترة، quick reply، templates menu.

### `/clinic/communications/campaigns`
- إنشاء حملة، اختيار قالب، جمهور تقديري، send/pause/draft.
- تأكيد قبل الإرسال.

### `/clinic/communications/templates`
- list panel + editor panel + preview panel.
- code/name/body/status + validation/placeholders.

## 7) Analytics Workspace

### `/clinic/analytics`
- Header تنفيذي + KPI strip + chart lane + table lane.
- no-show/cancellation/conversion/peak hours/doctor load.
- فلاتر ثابتة ومعنى تشغيلي لكل رقم.

## 8) Onboarding Contract (أول دخول للعيادة)

Checklist إلزامي:
- إضافة حساب Receptionist.
- إضافة حساب Doctor.
- ضبط ساعات العمل.
- إضافة Visit Types.
- ربط WhatsApp.
- تجربة أول حجز.
- تفعيل Reminders.

## 9) حالات العرض القياسية (لكل شاشة)

كل route تشغيلي يجب أن يدعم:
- `loading` (skeleton/shimmer)
- `empty` (رسالة + CTA)
- `error` (banner واضح + retry)
- `success` (toast/inline confirmation)
- `conflict` (حالات تعارض مع توجيه الحل)

## 10) Redirects التوافقية

- `marketing` -> `/`
- `reception` -> `/clinic/reception`
- `doctor` -> `/clinic/doctor`
- `doctor/billing` -> `/clinic/doctor/billing`
- `admin/clinics` -> `/platform/clinics` (توافق تاريخي)

هذا الملف هو مرجع واجهات المنتج المعتمد للتنفيذ والتطوير.
