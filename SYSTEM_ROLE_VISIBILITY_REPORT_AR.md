# تقرير صلاحيات وواجهات النظام (الإصدار النهائي)

## 1) الأدوار المعتمدة

الأدوار الوحيدة في النظام:
- `PlatformAdmin`
- `Receptionist`
- `Doctor`

لا يوجد دور `Admin` للعيادة.

---

## 2) PlatformAdmin

### نطاق الوصول
- `/platform/overview`
- `/platform/clinics`
- `/platform/subscriptions`
- `/platform/billing`
- `/platform/audit`
- `/platform/health`

### الصلاحيات
- إدارة كل العيادات والاشتراكات والفوترة والـadd-ons.
- مراجعة طلبات الاشتراك (approve/reject).
- اعتماد الدفع (`Cash` أو `ShamCash`) قبل التفعيل.
- تفعيل الخطة خلال مدة لا تتجاوز ساعتين بعد تأكيد الدفع.
- تدوير webhook secret والدخول إلى tenant context للمراقبة.

### القيود
- لا يوجد له Clinic Admin مستقل داخل كل عيادة.
- لا يعمل من منظور تشغيل يومي كـReception أو Doctor.

---

## 3) Receptionist

### نطاق الوصول
- `/clinic/reception`
- `/clinic/communications*`
- `/clinic/analytics`

### الصلاحيات
- إدارة التدفق اليومي: مواعيد، queue، walk-in، حالة الطبيب.
- إرسال/متابعة المحادثات والحملات ضمن حدود العيادة.

### القيود
- لا يستطيع إدارة الاشتراكات أو الفوترة أو المنصة.
- لا يعتمد طلبات الاشتراك.

---

## 4) Doctor

### نطاق الوصول
- `/clinic/doctor`
- `/clinic/doctor/billing`
- `/clinic/communications*`
- `/clinic/analytics`

### الصلاحيات
- العمل السريري اليومي (مواعيد، completed/no-show، ملخص الحالة).
- إرسال **طلب اشتراك فقط** عبر شاشة الطبيب.
- اختيار خطة + add-ons + طريقة الدفع (`Cash` أو `ShamCash`) + مرجع الدفع.

### القيود
- لا يمكنه الموافقة/الرفض.
- لا يمكنه تفعيل الخطة.
- لا يمكنه إدارة العيادات أو المنصة.

---

## 5) مسار الاشتراك الرسمي (Doctor -> PlatformAdmin)

1. الطبيب يفتح `/clinic/doctor/billing`.
2. يختار:
   - Plan tier
   - Channel
   - Cycle
   - Add-ons
   - Payment method (`Cash` أو `ShamCash`)
   - Payment reference (اختياري)
3. يرسل الطلب إلى:
   - `POST /api/subscriptions/requests`
4. الطلب يدخل حالة `Pending`.
5. `PlatformAdmin` يراجع الطلب في:
   - `/platform/subscriptions`
   - أو `/platform/clinics` (Queue)
6. عند قرار `approve`:
   - يتم تسجيل تأكيد الدفع والطريقة.
   - يتم تفعيل الاشتراك.
   - **SLA**: التفعيل خلال ساعتين كحد أقصى بعد وقت تأكيد الدفع.
7. عند `reject`:
   - تحفظ الحالة والسبب في الـtimeline والـaudit.

---

## 6) إجراءات حساسة (تحتاج تأكيد + Audit)

- approve/reject subscription
- mark invoice paid
- rotate webhook secret
- cancel appointment
- update critical statuses

كل إجراء حساس يجب أن يسجل في `audit log`.

---

## 7) خريطة سريعة (Role -> Primary Screens)

- `PlatformAdmin` -> `/platform/*`
- `Receptionist` -> `/clinic/reception`
- `Doctor` -> `/clinic/doctor` + `/clinic/doctor/billing`

---

## 8) خلاصة

النظام الآن يعمل بمعمارية واضحة:
- منصة مركزية يديرها `PlatformAdmin`.
- عيادة تشغيلية بدورين فقط: `Receptionist` و`Doctor`.
- اشتراك الطبيب هو طلب رسمي يمر بموافقة منصة، مع دعم دفع `Cash` و`ShamCash` وتفعيل خلال ساعتين بعد تأكيد الدفع.
