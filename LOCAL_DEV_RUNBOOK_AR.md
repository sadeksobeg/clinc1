# تشغيل المشروع محليًا (Local Dev Runbook)

هذا الملف يجمع:
- حسابات الدخول المتاحة (وطرق توليد/إعادة تعيين كلمات المرور)
- تفعيل تجاوز OTP في وضع التطوير
- أوامر إطفاء البورتات وتشغيل كل خدمة

## 1) حسابات الدخول (Credentials)

### A) Super Admin (منصة)
- **Email**: `superadmin@local.test`
- **Password (افتراضي في سكربت التهيئة)**: `SuperAdmin12345!`
- **مهم**: كلمة المرور قد تكون تغيّرت إذا شغّلت سكربت التهيئة بقيمة مختلفة.
- **OTP في التطوير (تجاوز MFA)**: `026114`

#### إنشاء/تحديث حساب السوبرأدمن (موصى به عند أول تشغيل)

من مجلد `ops-dashboard`:

```powershell
cd "D:\Sadek Company\Mid Auto\ops-dashboard"
node scripts/seed-super-admin.cjs superadmin@local.test "SuperAdmin12345!" "MFA_SECRET_BASE32"
```

> ملاحظة: السكربت **يتطلب** `MFA_SECRET_BASE32` كوسيط ثالث. في بيئة التطوير تستطيع تجاوز MFA بإدخال OTP = `026114` (انظر القسم 2).

### B) Admin داخل عيادة (غير منصة)
أي حساب تنشئه من السوبرأدمن لعيادة سيكون:
- **scope=clinic**
- صلاحياته فقط لإدارة عيادته

> كلمة المرور تُحدّدها أنت عند إنشاء العيادة من صفحة المنصة (Create clinic).

### C) Ops Admin محلي (إن كان موجودًا في قاعدة البيانات)
يوجد سكربت لإعادة تعيين كلمة مرور حساب مثل `ops@local.test` إن كان موجودًا:

```powershell
cd "D:\Sadek Company\Mid Auto\ops-dashboard"
node scripts/reset-local-admin-password.cjs ops@local.test "Admin12345!"
```

إذا قال السكربت أنه لا يوجد مستخدم مطابق، فهذا يعني الحساب غير موجود بعد في DB.

### D) استكشاف «أنا متأكد من كلمة المرور لكن الدخول يرفض»

الأغلب أن **تحديث كلمة المرور تم على قاعدة بيانات، والدخول يقرأ من أخرى**.

1. سكربت **`reset-local-admin-password.cjs`** يحمّل الآن **`ops-dashboard/.env`** و **`.env.local`** (مثل `seed-super-admin`). تأكد أن **`DATABASE_URL`** هو نفسه الذي يستخدمه **`npm run dev`** في `ops-dashboard`.
2. من مجلد `ops-dashboard`:

   ```powershell
   node scripts/print-staff-user.cjs البريد@المستخدم.com
   ```

   راقب: `found`، `is_active`، `has_password`، `is_deleted`. إذا `found: false` فالبريد غير موجود في هذه الـ DB.
3. تطبيق **`apps/web`** يتصل بمصادقة **`ops-dashboard`** عبر **`OPS_DASHBOARD_URL`** (مثل `http://127.0.0.1:3001`). إذا كان العنوان يشير لسيرفر/منفذ آخر، فستُقارن كلمة المرور مع مستخدم مختلف أو DB مختلفة.
4. **Super Admin**: بعد نجاح كلمة المرور يطلب النظام **OTP** (أو تجاوز التطوير). إن رأيت `invalid_credentials` في **الخطوة الأولى** فالمشكلة ما زالت البريد/كلمة المرور أو قاعدة البيانات، وليست OTP.

### E) خطأ `ECONNREFUSED 127.0.0.1:5435` عند تسجيل الدخول

`ops-dashboard` يتصل بـ PostgreSQL حسب **`DATABASE_URL`** (في `.env.local` غالبًا منفذ **5435**). هذا الخطأ يعني: **لا يوجد Postgres يستمع على 5435** (الخدمة متوقفة أو المنفذ مختلف).

**خيار 1 — تشغيل Postgres كما في المشروع (Docker):** من جذر المستودع:

- **تطوير سريع:** الافتراضيات في `docker-compose.clinic.yml` (`postgres` / `clinicadmin`) تكفي لتشغيل Postgres دون ملف `.env`.
- **بيئة أقرب للإنتاج:** انسخ **`/.env.example`** إلى **`.env`** في الجذر، واستبدل `REPLACE_WITH_STRONG_SECRET` بقيم قوية، وحدّث **`DATABASE_URL`** في `ops-dashboard/.env.local` ليطابق **كلمة مرور Postgres** الجديدة (`postgresql://postgres:YOUR_PASS@127.0.0.1:5435/clinic_ops`).

```powershell
cd "D:\Sadek Company\Mid Auto"
Copy-Item .env.example .env   # ثم عدّل .env يدويًا
docker compose -f docker-compose.clinic.yml up -d postgres
```

ثم تأكد أن قاعدة **`clinic_ops`** موجودة (إن لزم: `npm run db:provision-local-ops` من `ops-dashboard` حسب README). سكربت التهيئة يحمّل **`ops-dashboard/.env`** و **`.env.local`** ويمكن تعريف **`POSTGRES_ADMIN_URL`** إن كانت كلمة مرور Postgres ليست الافتراضية `postgres`.

**خيار 2 — Postgres محلي على منفذ آخر (مثل 5432):** حدّث **`ops-dashboard/.env.local`**:

`DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5432/اسم_قاعدة_العمليات`

وأعد تشغيل `npm run dev` للوحة.

## 2) تفعيل “تجاوز OTP” في شاشة الدخول (تطوير)

تم ضبط القيم التالية:
- `ops-dashboard/.env.local` يحتوي `SUPERADMIN_DEV_OTP=026114`
- `apps/web/.env.local` يحتوي `NEXT_PUBLIC_SUPERADMIN_DEV_OTP=026114`

بعد إعادة تشغيل `apps/web` ستظهر في شاشة الدخول checkbox:
**تجاوز OTP (تطوير)**.

## 3) البورتات والخدمات

### البورتات
- `apps/web`: `3000`
- `ops-dashboard`: `3001`
- `whatsapp-bridge`: `3101`

### A) إطفاء كل شيء (تحرير البورتات)

```powershell
Get-NetTCPConnection -LocalPort 3000,3001,3101 -ErrorAction SilentlyContinue |
  Select-Object LocalPort,OwningProcess,State |
  Sort-Object LocalPort |
  Format-Table -AutoSize
```

خذ قيمة `OwningProcess` ثم:

```powershell
Stop-Process -Id <PID> -Force
```

### B) تشغيل كل شيء (بالترتيب)

#### 1) ops-dashboard (3001)
```powershell
cd "D:\Sadek Company\Mid Auto\ops-dashboard"
npm run dev
```

#### 2) apps/web (3000)
```powershell
cd "D:\Sadek Company\Mid Auto\apps\web"
npm run dev
```

#### 3) whatsapp-bridge (3101)
```powershell
cd "D:\Sadek Company\Mid Auto\whatsapp-bridge"
npm run start:bridge
```

### C) فحوصات سريعة بعد التشغيل

```powershell
(Invoke-WebRequest http://127.0.0.1:3000 -UseBasicParsing).StatusCode
(Invoke-WebRequest http://127.0.0.1:3001/api/internal/system/health -UseBasicParsing -Headers @{ Authorization = 'Bearer mid-auto-local-dev-token-32chars-minimum!!' }).StatusCode
(Invoke-WebRequest http://127.0.0.1:3101/ready -UseBasicParsing).Content
```

المتوقع:
- `3000` يرجع `200`
- `3001` يرجع `200`
- `3101/ready` يرجع `{"ok":true,"ready":true}`

