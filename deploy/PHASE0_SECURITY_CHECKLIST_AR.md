# المرحلة 0 — قائمة تحقق أمنية

## كود (مطبّق في المستودع)

- [x] `apps/web/middleware.ts` — حماية `/staff` و `/support-agent`
- [x] `docker-compose.prod.yml` — `OPS_WHATSAPP_PRIMARY_HANDLER=ops`؛ إزالة تمرير `SUPERADMIN_IP_ALLOWLIST_DISABLED`
- [x] `ops-dashboard` — تجاهل تجاوز IP في `NODE_ENV=production`
- [x] `scripts/production-env-audit.mjs` — حظر `SUPERADMIN_IP_ALLOWLIST_DISABLED` في الإنتاج

## على السيرفر (يدوي)

- [ ] تدوير `JWT_SECRET` و `SCHEDULING_SERVICE_TOKEN` (≥32 حرفًا): `node scripts/generate-production-secrets.mjs`
- [ ] تدوير `BRIDGE_SEND_API_TOKEN` ومزامنته مع ops
- [ ] التأكد أن `.env.prod` **لا** يحتوي `SUPERADMIN_IP_ALLOWLIST_DISABLED=1`
- [ ] ufw / firewall — منفذ 3100 مغلق من WAN ([BRIDGE_NETWORK_SECURITY.md](./BRIDGE_NETWORK_SECURITY.md))
- [ ] `node scripts/production-env-audit.mjs --file .env.prod`
- [ ] `npm run gate:p7` أو smoke أساسي
