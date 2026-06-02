# CI/CD وإطلاق — Clinic OS (المرحلة F)

## ما هو مفعّل اليوم

- GitHub Actions: [`.github/workflows/clinic-os-ci.yml`](../.github/workflows/clinic-os-ci.yml)
- Release gates ليلية: [`.github/workflows/release-gates.yml`](../.github/workflows/release-gates.yml)
- أوامر محلية: `npm run gate:p7`, `npm run e2e:go-live-smoke`

## مسار deploy موصى به (VPS)

```bash
cd /opt/clinic-os
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build ops-dashboard clinic-web
sudo systemctl restart whatsapp-bridge
bash deploy/scripts/verify-inbox-whatsapp-fixes.sh
bash deploy/scripts/monitoring-health-check.sh
```

## قبل كل إصدار

1. `npm run audit:production-env`
2. `bash deploy/scripts/run-release-gates.sh` (على staging أو VPS مع خدمات حية)
3. `MANUAL_UAT_LAUNCH_CHECKLIST_AR.txt` — أدوار حرجة
4. `bash deploy/scripts/backup-clinic-os.sh`

## تحسينات F (مستقبلي)

- Deploy تلقائي من `main` إلى staging عبر SSH أو GitHub Actions
- حاوية bridge في CI smoke
- تقارير `p7-go-live-report.json` مرفقة بكل release tag
