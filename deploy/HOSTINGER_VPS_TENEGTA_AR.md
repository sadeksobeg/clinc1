# نشر المشروع على Hostinger VPS + الدومين `tenegta.tech`

يغطي هذا الدليل السيناريو الذي ظهر في لوحة التحكم:

- **VPS:** Ubuntu 24.04، عنوان **72.62.155.198**، دخول SSH: `ssh root@72.62.155.198`
- **الدومين:** `tenegta.tech` (استبدل إن غيّرت الاسم)

---

## قائمة تنفيذ سريعة (نفّذ بالترتيب)

1. ادخل SSH: `ssh root@72.62.155.198`
2. في Hostinger DNS: سجل **A** للـ `@` → `72.62.155.198` (و`www` إن رغبت).
3. ثبّت **ufw** وافتح **22 / 80 / 443** (القسم 2).
4. ثبّت **Docker** + **compose plugin** (القسم 3).
5. انسخ المستودع إلى `/opt/clinic-os` (القسم 4).
6. أنشئ `.env.prod` من `.env.prod.example` واملأ الأسرار (القسم 5).
7. شغّل: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` (القسم 6).
8. تحقق: `curl -I http://127.0.0.1:3000` و`docker compose ... ps`.
9. ثبّت **nginx** + **certbot** وانسخ قالب الموقع (القسم 7).
10. نفّذ **تهيية DB + سوبر أدمن** من المضيف (القسم 8 — مهم).
11. افتح المتصفح: `https://tenegta.tech`

**ملاحظة بناء محلي (Windows):** إذا فشل `pnpm build:web` بخطأ `jest-worker`، نفّذ من جذر المستودع `pnpm install` ثم أعد المحاولة، أو من مجلد الويب مباشرة: `cd apps/web && npm run build` (يُفضّل بعد `pnpm install` من الجذر لضمان اكتمال `node_modules`).

---

## 1) ربط الدومين بالـ VPS (DNS)

في Hostinger → **Domains** → `tenegta.tech` → **DNS / Nameservers**:

1. إذا كان الدومين على **DNS Parking** (`apollo.dns-parking.com` …)، غيّر إلى **DNS الافتراضي لـ Hostinger** أو أضف سجلات يدويًا عند Hostinger.
2. أضف السجلات التالية (أمثلة — عدّل إن استخدمت نطاقات فرعية مختلفة):

| النوع | الاسم | القيمة | ملاحظة |
|--------|--------|--------|--------|
| A | `@` | `72.62.155.198` | الموقع الرئيسي |
| A | `www` | `72.62.155.198` | اختياري |
| A | `ops` | `72.62.155.198` | إن أردت فصل واجهة الـ API على `ops.tenegta.tech` |
| A | `n8n` | `72.62.155.198` | إن شغّلت n8n كما في `docker-compose.prod.yml` |

انتظر انتشار DNS (غالبًا من دقائق إلى ساعات).

## 2) جدار الحماية على السيرفر

على الـ VPS (Ubuntu):

```bash
apt update && apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## 3) Docker + Docker Compose

```bash
apt install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 4) رفع الكود

خيار أبسط: **Git clone** على السيرفر (إن كان المستودع على GitHub/GitLab):

```bash
mkdir -p /opt && cd /opt
git clone <YOUR_REPO_URL> clinic-os
cd clinic-os
```

أو من جهازك (Windows) باستخدام **scp/rsync** إلى `/opt/clinic-os`.

## 5) ملف البيئة الإنتاجية

```bash
cd /opt/clinic-os
cp .env.prod.example .env.prod
nano .env.prod
```

- عيّن `POSTGRES_PASSWORD` و`DATABASE_URL` (نفس كلمة مرور `postgres` داخل الـ URL).
- عيّن `JWT_SECRET` و`SCHEDULING_SERVICE_TOKEN` بقيم عشوائية طويلة.
- عيّن `N8N_BASIC_AUTH_*` و`N8N_PUBLIC_WEBHOOK_URL` (مثلاً `https://n8n.tenegta.tech/` إذا أضفت سجل A لـ `n8n`).
- احتفظ بـ `OPS_DASHBOARD_URL=http://ops-dashboard:3001` لاتصال الحاويات بعضها ببعض.

## 6) تشغيل الحزمة

من جذر المستودع على السيرفر:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

التحقق:

```bash
docker compose -f docker-compose.prod.yml ps
curl -sS http://127.0.0.1:3000/ | head
curl -sS http://127.0.0.1:3001/api/health 2>/dev/null || curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/
```

- **clinic-web (واجهة Next):** `127.0.0.1:3000`
- **ops-dashboard:** `127.0.0.1:3001`

## 7) Nginx + شهادة TLS (Let’s Encrypt)

```bash
apt install -y nginx certbot python3-certbot-nginx
```

انسخ القالب (من جذر المستودع على السيرفر) ثم فعّل الموقع واحذف الافتراضي إن تعارض المنفذ 80:

```bash
cd /opt/clinic-os
cp deploy/nginx/tenegta.tech.conf.example /etc/nginx/sites-available/tenegta.tech
ln -sf /etc/nginx/sites-available/tenegta.tech /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d tenegta.tech -d www.tenegta.tech
nginx -t && systemctl reload nginx
curl -I https://tenegta.tech
```

إذا فعّلت `ops` و`n8n` كسجلات A، أضف نفس أسلوب `server { ... }` لكل اسم (أو دمج لاحقًا).

## 7.1) إن رفض Certbot الاتصال

- تأكد أن DNS يشير فعليًا إلى السيرفر: `dig +short tenegta.tech A`
- تأكد أن المنفذ 80 مفتوح من الخارج: `curl -I http://tenegta.tech` من جهازك (يجب أن يصل لـ nginx قبل الشهادة).

## 8) تهيئة قاعدة البيانات والسوبر أدمن

صورة **ops-dashboard** في Docker مبنية كـ Next **standalone** ولا تضم مجلد `scripts/` داخل الحاوية، لذلك أوّل مرة تُشغّل فيها ترحيلات الـ DB وسوبر الأدمن من **نفس الـ VPS على المضيف** (مع Node 20) وتتصل بـ Postgres المنشور على `127.0.0.1:5432`.

### 8.1 — تثبيت Node 20 على Ubuntu (مرة واحدة)

```bash
apt install -y ca-certificates curl
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
```

### 8.2 — تثبيت تبعيات ops-dashboard على المضيف

```bash
cd /opt/clinic-os/ops-dashboard
npm ci
```

### 8.3 — نفس `DATABASE_URL` كما في `.env.prod` لكن باتجاه المضيف

استبدل `YOUR_POSTGRES_PASSWORD` بكلمة المرور من `.env.prod`:

```bash
export DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@127.0.0.1:5432/clinicsaas"
```

**بديل (أوضح):** أنشئ ملف `/opt/clinic-os/ops-dashboard/.env` يحتوي سطرًا واحدًا (نفس الـ URL أعلاه). سكربتات `npm run …` تقرأه تلقائيًا عبر `load-ops-env.cjs` إذا لم تُصدَر المتغيرات في الطرفية.

### 8.4 — تهيية قاعدة العمليات (إن وُجد السكربت في مشروعك)

```bash
npm run db:provision-local-ops
```

### 8.5 — إنشاء سوبر أدمن (انظر أيضًا `LOCAL_DEV_RUNBOOK_AR.md`)

الوسيط **الثالث إلزامي**: سر MFA بصيغة **Base32** (أحرف `A–Z` و`2–7`). توليد مثال على السيرفر (Python 3):

```bash
export MFA32=$(python3 -c "import secrets,string; a=string.ascii_uppercase+'234567'; print(''.join(secrets.choice(a) for _ in range(32)))")
echo "$MFA32"
npm run auth:seed-super-admin -- superadmin@tenegta.tech "StrongPasswordHere!" "$MFA32"
```

بديل مكافئ (نفس الوسائط):

```bash
node scripts/seed-super-admin.cjs superadmin@tenegta.tech "StrongPasswordHere!" "$MFA32"
```

بعدها سجّل الدخول من الواجهة العامة `https://tenegta.tech/login` (أو المسار الذي يوجّه إليه تطبيق الويب) باستخدام البريد وكلمة المرور أعلاه، واتبع تعليمات OTP في المشروع.

**اختياري:** لتجنب `export DATABASE_URL` في كل جلسة، انسخ سطر `DATABASE_URL` من `/opt/clinic-os/.env.prod` إلى `/opt/clinic-os/ops-dashboard/.env.local` (نفس قيمة الاتصال بـ `127.0.0.1:5432`).

### 8.6 — إن فشل أمر ما

- تأكد أن حاوية Postgres تعمل: `docker compose -f docker-compose.prod.yml --env-file .env.prod ps`.
- تأكد أن المنفذ `127.0.0.1:5432` يستجيب: `ss -lntp | grep 5432`.
- راجع سجلات ops: `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f ops-dashboard --tail=100`.

### 8.7 — جسر واتساب على المضيف و«حالة الربط» في الإعدادات

`ops-dashboard` يفحص الجسر من **داخل Docker** عبر `http://host.docker.internal:3100/ready`. إن ظهر خطأ مثل **Connect Timeout** لعنوان `172.17.0.1` أو `host.docker.internal`:

1. **يجب أن يستمع الجسر على كل الواجهات** وليس `127.0.0.1` فقط. في `whatsapp-bridge/.env` على الـ VPS عيّن:
   - `BRIDGE_BIND_HOST=0.0.0.0`
   - ثم أعد تشغيل خدمة الجسر (مثلاً `systemctl restart whatsapp-bridge` إن كنت تستخدم systemd).
2. تحقق من المضيف: `ss -tlnp | grep 3100` — المتوقع `0.0.0.0:3100` (أو `*:3100`) وليس `127.0.0.1:3100` فقط.
3. تحقق من الحاوية:  
   `docker compose -f docker-compose.prod.yml --env-file .env.prod exec ops-dashboard wget -qO- --timeout=5 http://host.docker.internal:3100/ready`  
   المتوقع: `{"ok":true,"ready":true}` (أو مشابه).
4. شبكة **docker-compose** ليست بالضرورة `172.17.0.1` (ذلك لـ `docker0` فقط). إن احتجت URL احتياطيًا في `.env.prod` استخرج **Gateway** لشبكة المشروع:  
   `docker network ls` ثم `docker network inspect <اسم_الشبكة> | grep Gateway`.

لا تفتح المنفذ `3100` للإنترنت العام؛ الربط على `0.0.0.0` مع بقاء الجدار الناري يمنع الوصول الخارجي كافٍ طالما لا يوجد `ufw allow 3100` من العالم.

## 9) ملاحظات أمان

- لا تفتح منافذ Postgres أو Redis أو n8n على `0.0.0.0` في الإنتاج؛ الـ compose الحالي يربطها بـ `127.0.0.1` حيث يلزم.
- احتفظ بـ `.env.prod` خارج Git وصلاحياته مقيدة (`chmod 600 .env.prod`).

## 10) تحديثات لاحقة

```bash
cd /opt/clinic-os
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

---

**ملخص:** DNS → A إلى `72.62.155.198` → Docker Compose على السيرفر → Nginx + Certbot للـ HTTPS على `tenegta.tech`.

---

## 11) نسخة «تعليمة تعليمة» للصق على الـ VPS (بعد استبدال القيم)

نفّذ **واحدة تلو الأخرى**. استبدل:

- `YOUR_GIT_REPO_URL` برابط الـ clone (HTTPS أو SSH).
- كلمات المرور والأسرار في `.env.prod` كما في القسم 5.

```bash
# 1 — دخول السيرفر (من جهازك)
ssh root@72.62.155.198

# 2 — جدار حماية
apt update && apt install -y ufw
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# 3 — Docker
apt install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 4 — استنساخ المشروع
mkdir -p /opt && cd /opt
git clone YOUR_GIT_REPO_URL clinic-os
cd /opt/clinic-os

# 5 — بيئة الإنتاج (افتح المحرر واملأ القيم)
cp .env.prod.example .env.prod
nano .env.prod

# 6 — تشغيل الحزمة
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 7 — تحقق سريع
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1:3001

# 8 — Nginx + شهادة (بعد أن يكون DNS لـ tenegta.tech يشير إلى هذا السيرفر)
apt install -y nginx certbot python3-certbot-nginx
cd /opt/clinic-os
cp deploy/nginx/tenegta.tech.conf.example /etc/nginx/sites-available/tenegta.tech
ln -sf /etc/nginx/sites-available/tenegta.tech /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d tenegta.tech -d www.tenegta.tech

# 9 — Node على المضيف + تهيية DB + سوبر أدمن (راجع القسم 8 بالتفصيل)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
cd /opt/clinic-os/ops-dashboard && npm ci
export DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@127.0.0.1:5432/clinicsaas"
npm run db:provision-local-ops
export MFA32=$(python3 -c "import secrets,string; a=string.ascii_uppercase+'234567'; print(''.join(secrets.choice(a) for _ in range(32)))")
npm run auth:seed-super-admin -- superadmin@tenegta.tech 'StrongPasswordReplaceMe!' "$MFA32"
echo "احفظ MFA32 للمصادقة الثنائية: $MFA32"

# 10 — بعد Certbot (تأكيد الإعدادات)
nginx -t && systemctl reload nginx
```

بعد الخطوة 9 و10: جرّب `https://tenegta.tech/login` بالبريد وكلمة المرور التي استخدمتها في `auth:seed-super-admin`، واستخدم تطبيق MFA مع القيمة `MFA32` إن طُلب OTP.
