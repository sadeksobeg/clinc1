# ماذا تفعل على السيرفر بعد `git pull` (بدون تغيير مكتبة واتساب)

**قرار المنتج:** الإبقاء على **`whatsapp-web.js`** عبر `whatsapp-bridge` — لا هجرة إلى WhatsApp Business API (راجع ADR-006: مؤجّل).

## 1) سحب الكود وبناء الخدمات

```bash
cd /opt/clinic-os
git pull origin main

# يحدّث nginx snippet + يعيد بناء ops + clinic-web + جسر + iptables
sudo bash scripts/vps-apply-after-git-pull.sh
```

## 2) إغلاق المرحلة A (مرة واحدة أو بعد كل إصدار)

```bash
cd /opt/clinic-os
bash deploy/scripts/phase-a-production-closeout.sh

# تحقق واتساب + ops (يجب أن تنجح الخطوة 4: bridge من Docker)
bash deploy/scripts/verify-inbox-whatsapp-fixes.sh
```

### `.env.prod` — تأكد من:

```env
POSTGRES_DB=clinic_ops
REDIS_URL=
BRIDGE_INTERNAL_URL=http://172.16.1.1:3100
OPS_WHATSAPP_PRIMARY_HANDLER=ops
```

### نموذج التواصل → `info@tenegta.com`

```bash
cd /opt/clinic-os
SMTP_PASS='كلمة_مرور_صندوق_البريد' sudo -E bash deploy/scripts/configure-contact-smtp-env.sh
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d clinic-web
```

أو يدوياً في `.env.prod`:

```env
CONTACT_TO_EMAIL=info@tenegta.com
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@tenegta.com
SMTP_PASS=كلمة_مرور_صندوق_البريد
SMTP_FROM="نسق <info@tenegta.com>"
```

(استبدل `172.16.1.1` بـ Gateway الفعلي:  
`docker network inspect clinic-os_default --format '{{(index .IPAM.Config 0).Gateway}}'`)

### تدوير أسرار (موصى به)

```bash
node scripts/sync-production-env.mjs --dry-run
node scripts/sync-production-env.mjs --apply --rotate-secrets
sudo systemctl restart whatsapp-bridge
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d ops-dashboard clinic-web
```

### تنظيف محادثات اختبار (اختياري)

```bash
bash deploy/scripts/cleanup-test-conversations.sh
```

### `ops-dashboard/.env.local` (أدوات المضيف فقط)

```bash
cp ops-dashboard/.env.local.example ops-dashboard/.env.local
# عدّل DATABASE_URL → .../clinic_ops على 127.0.0.1:5432
```

## 3) مراقبة ونسخ احتياطي (المرحلة B)

```bash
# نسخ احتياطي يدوي
bash deploy/scripts/backup-clinic-os.sh

# فحص صحة (للـ cron)
bash deploy/scripts/monitoring-health-check.sh

# تثبيت cron كل 6 ساعات (اختياري)
sudo bash deploy/scripts/install-monitoring-cron.sh
```

**Redis / event-consumer:** الوضع المعتمد **Optional** — اترك `REDIS_URL=` فارغاً للعيادة الأولى.  
راجع [`docs/operations/REDIS_EVENT_CONSUMER_DECISION.md`](../docs/operations/REDIS_EVENT_CONSUMER_DECISION.md).

## 4) اختبار المتصفح

1. `https://tenegta.tech/login`
2. سوبر أدمن: اختر **عيادة من الشريط العلوي** (Clinic mode) قبل Inbox
3. `https://tenegta.tech/inbox` — يجب أن تظهر الرسائل في الوسط
4. طبيب: بعد الدخول يُوجَّه إلى `/doctor`
5. أرسل رسالة واتساب → رد تلقائي على الهاتف

## 5) بوابات إطلاق (عند التحديثات الكبيرة)

```bash
cd /opt/clinic-os
npm run deploy:release-gates
```

يتطلب `ops-dashboard` و`clinic-web` على `127.0.0.1:3001` و`:3000`.

## 6) Ollama (المرحلة D — اختياري)

```bash
# على السيرفر بعد تثبيت Ollama
# أضف إلى .env.prod: OLLAMA_URL=http://172.16.1.1:11434
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d ops-dashboard
```

راجع [`docs/operations/OLLAMA_PRODUCTION_CHECKLIST_AR.md`](../docs/operations/OLLAMA_PRODUCTION_CHECKLIST_AR.md).

## فهرس كامل

[`docs/WORLD_CLASS_ROADMAP_INDEX_AR.md`](../docs/WORLD_CLASS_ROADMAP_INDEX_AR.md)
