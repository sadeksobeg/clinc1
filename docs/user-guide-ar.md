# دليل الاستخدام المبسط - ClinicSaaS

هذا الدليل مكتوب بلغة بسيطة لتشغيل النظام وتجربة أهم الأوامر/الإجراءات من البداية للنهاية.

## 1) تشغيل النظام

افتح نافذتين Terminal:

1. تشغيل الـ API:

```powershell
cd "D:\Sadek Company\Mid Auto\src\ClinicSaaS.Api"
dotnet run
```

2. تشغيل الـ Frontend:

```powershell
cd "D:\Sadek Company\Mid Auto\frontend\ClinicSaaS.Web"
npm start
```

3. افتح المتصفح:
- الواجهة: `http://localhost:4200`
- Swagger: `http://localhost:5137/swagger`

---

## 2) سيناريو شامل لتجربة التطبيق (End-to-End)

الهدف من السيناريو: التأكد أن دورة الاشتراك، التشغيل اليومي، الدعم، والفوترة تعمل بالكامل.

> ملاحظة: استخدم أي حسابات اختبار متاحة لديك حسب الدور (Platform Admin / Doctor / Reception / Support).

### المرحلة A - منصة الإدارة (Platform Admin)

1. سجّل الدخول كـ Platform Admin.
2. ادخل صفحة `platform/overview`.
3. اضغط `Refresh` وتأكد أن:
   - أرقام الـ KPI تظهر.
   - قائمة العيادات تظهر.
   - Subscription Pipeline يظهر فيه مراحل الطلبات.
4. بدّل بين:
   - `الكل`
   - `المشاكل فقط`
   وتأكد أن الفلترة تتغير.
5. ادخل `platform/clinics`:
   - راجع العيادات الحالية.
   - افتح صفحة `platform/subscriptions`.

**النتيجة المتوقعة:** لا توجد أخطاء تحميل، والبيانات تظهر بشكل طبيعي.

### المرحلة B - دورة الاشتراك كاملة (Subscription Lifecycle)

1. من `platform/subscriptions` اختر طلب حالته `Requested`.
2. نفّذ أمر `Approve`.
   - يجب أن تصبح الحالة `AwaitingPayment`.
3. نفّذ `Confirm payment`.
   - أدخل وسيلة الدفع (Cash أو ShamCash) + مرجع الدفع.
   - يجب أن تصبح الحالة `PaymentConfirmed`.
4. نفّذ `Activate`.
   - يجب أن تصبح الحالة `Activated`.
5. ارجع إلى `platform/overview` واضغط `Refresh`.
   - تأكد أن Pipeline وConversion تم تحديثهم.

**النتيجة المتوقعة:** الطلب يمر بالمراحل الأربع بدون أخطاء.

### ملاحظات UX جديدة (Stripe-style)

- صفحة الطبيب `clinic/doctor/billing` أصبحت تعرض:
  - الخطة الحالية بشكل واضح في الهيدر.
  - حالة السماح بإنشاء طلب جديد.
  - ملخص تغيير الخطة لكل طلب (`upgrade / downgrade / renewal`).
- إذا يوجد طلب مفتوح (`Requested` أو `AwaitingPayment` أو `PaymentConfirmed`) فلن يُسمح بإنشاء طلب جديد حتى يُحسم الطلب الحالي.
- صفحة المنصة `platform/subscriptions` أصبحت Console تشغيلية:
  - KPIs سريعة للحالات.
  - بحث وفلترة حسب الحالة.
  - لوحة تفاصيل واضحة للعيادة/الطبيب/الدفع/نوع التغيير.

### المرحلة C - إدارة حالة العيادة

1. من `platform/overview` أو صفحة العيادات:
   - اضغط `Suspend` على عيادة.
   - تأكد من تغيّر الحالة.
2. اضغط `Reactivate`.
   - تأكد أن الحالة رجعت للعمل.

**النتيجة المتوقعة:** أوامر التعليق/إعادة التفعيل تعمل مباشرة.

### المرحلة D - دور الطبيب (Doctor)

1. سجّل الدخول بحساب Doctor.
2. افتح `doctor/dashboard`.
3. راقب صندوق Startup Guide:
   - يظهر أول مرة.
   - عند الضغط على `إخفاء` يختفي.
4. جرّب الإجراءات اليومية الأساسية:
   - فتح لوحة اليوم.
   - مراجعة المرضى/المواعيد حسب ما هو متاح.
5. افتح صفحة الفوترة الخاصة بالطبيب (إن كانت مفعلة) وتأكد من فتحها بدون أخطاء.

**النتيجة المتوقعة:** تجربة الطبيب مستقرة، ودليل البداية يعمل.

### المرحلة E - دور الاستقبال (Reception)

1. سجّل الدخول بحساب Reception.
2. افتح `reception/dashboard`.
3. تأكد من ظهور Startup Guide أول مرة.
4. جرّب العمليات الأساسية:
   - تسجيل/إدارة الحضور.
   - التعامل مع قائمة الانتظار.
   - تحديث حالة الموعد (إن متاح).

**النتيجة المتوقعة:** شاشة الاستقبال تعمل بدون أخطاء صلاحيات.

### المرحلة F - دور الدعم (Support)

1. سجّل الدخول بحساب Support.
2. افتح `platform/support`.
3. راجع تذاكر/محادثات الدعم.
4. نفّذ إجراءات الدعم المتاحة (تحديث الحالة، الرد، المتابعة).
5. تأكد من ظهور Startup Guide لهذا الدور.

**النتيجة المتوقعة:** مسار الدعم يعمل مع صلاحيات صحيحة.

### المرحلة G - التحقق من الأمان والصلاحيات

1. جرّب فتح صفحات Platform من حساب غير مخوّل.
2. تأكد أن النظام يرجع `401` أو يمنع الوصول.
3. من حساب Platform Admin، تأكد أن نفس الصفحات تعمل.

**النتيجة المتوقعة:** لا يوجد تجاوز صلاحيات.

### المرحلة H - التحقق من السجلات والعمليات

1. افتح `platform/activity`.
2. تأكد أن العمليات السابقة (Approve/Confirm/Activate/Suspend/Reactivate) لها أثر في السجل.
3. افتح `platform/metrics` (إن متاح من الواجهة أو API) وتأكد من وجود بيانات runtime/intelligence.

**النتيجة المتوقعة:** الأثر التشغيلي واضح في السجلات.

---

## 3) سيناريو قبول نهائي سريع (10 دقائق)

إذا كنت تريد اختبارًا سريعًا قبل التسليم:

1. تشغيل API + Frontend.
2. Platform Admin:
   - Overview يفتح بدون أخطاء.
   - تنفيذ طلب اشتراك من Requested إلى Activated.
3. Doctor + Reception + Support:
   - تسجيل دخول.
   - فتح الداشبورد.
   - ظهور Startup Guide وإخفاؤه.
4. الرجوع إلى Platform Overview:
   - Refresh.
   - تأكد من تحديث KPI وConversion.

إذا نجحت النقاط الأربع، فالنظام جاهز للتجربة التشغيلية.

---

## 4) حلول سريعة للمشاكل الشائعة

- `ERR_CONNECTION_REFUSED`:
  - الـ API غير شغال أو على بورت مختلف.
- `401 Unauthorized`:
  - انتهت الجلسة أو الحساب ليس لديه صلاحية.
  - أعد تسجيل الدخول.
- KPI لا تتحدث:
  - اضغط `Refresh`.
  - تأكد أن العملية اكتملت (خصوصًا في الاشتراكات).

---

## 5) نظام الفوترة الجديد (Enterprise Billing)

- مسارات الإدارة:
  - `GET /api/platform/plans`
  - `POST /api/platform/plans`
  - `GET /api/platform/subscriptions`
  - `POST /api/platform/subscriptions`
  - `POST /api/platform/subscriptions/{subscriptionId}/approve`
  - `POST /api/platform/subscriptions/{subscriptionId}/confirm-payment`
  - `POST /api/platform/subscriptions/{subscriptionId}/activate`
  - `POST /api/platform/subscriptions/{subscriptionId}/reject`
  - `GET /api/platform/invoices`
  - `POST /api/platform/invoices/{invoiceId}/mark-paid`
  - `POST /api/platform/trials`

- مسارات المستأجر:
  - `GET /api/tenant/subscription`
  - `GET /api/tenant/subscription/usage`
  - `GET /api/tenant/subscription/plans`
  - `POST /api/tenant/subscription/request`
  - `GET /api/tenant/subscription/invoices`

- حالات الاشتراك الأساسية:
  - `Requested`, `AwaitingPayment`, `Active`, `Trial`, `Suspended`, `Cancelled`, `Expired`

- القاعدة التشغيلية:
  - لا يمكن إنشاء طلب جديد إذا كان هناك طلب قيد المعالجة (`Requested/AwaitingPayment/PaymentConfirmed`).
  - تأكيد الدفع يصبح idempotent (لن يفعّل مرتين عند نفس الفاتورة).

