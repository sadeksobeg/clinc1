# المرحلة A — إغلاق الإنتاج (VPS)

## أوامر سريعة

```bash
cd /opt/clinic-os
git pull origin main

# تحقق واتساب + ops
bash deploy/scripts/phase-a-production-closeout.sh

# بوابات (يتطلب ops-dashboard + clinic-web على 3001/3000)
bash deploy/scripts/run-release-gates.sh

# تنظيف محادثات اختبار (تفاعلي)
bash deploy/scripts/cleanup-test-conversations.sh
```

## `.env.prod` — تحقق

- `POSTGRES_DB=clinic_ops`
- `REDIS_URL=` فارغ إن لا Redis
- `BRIDGE_INTERNAL_URL=http://<Gateway>:3100` (IPv4 — `docker network inspect clinic-os_default`)
- `BRIDGE_SEND_TOKEN` = `whatsapp-bridge/.env` → `BRIDGE_SEND_API_TOKEN`

## `ops-dashboard/.env.local` (على المضيف)

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/clinic_ops
```

## Inbox

افتح `https://tenegta.tech/inbox` في **وضع Clinic** (عيادة 1)، ليس Global.

## تدوير أسرار

```bash
node scripts/sync-production-env.mjs --dry-run
node scripts/sync-production-env.mjs --apply --rotate-secrets
sudo systemctl restart whatsapp-bridge
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d ops-dashboard clinic-web
```
