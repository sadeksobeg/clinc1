# تشغيل جسر واتساب (whatsapp-web.js)

## المبدأ

النظام يبقى على **`whatsapp-web.js`** (ليس WhatsApp Business API). المخاطر: تحديثات واتساب قد تكسر المكتبة — راجع هذا الدليل عند كل حادث.

## إعداد آمن

| متغير | توصية |
|--------|--------|
| `BRIDGE_SEND_API_TOKEN` | إلزامي في `NODE_ENV=production` |
| `BRIDGE_BIND_HOST` | `0.0.0.0` + firewall، أو `127.0.0.1` + [BRIDGE_NETWORK_SECURITY.md](./BRIDGE_NETWORK_SECURITY.md) |
| `OPS_WHATSAPP_PRIMARY_HANDLER` | `ops` — وارد إلى `process-inbound` فقط |
| `WA_HEADLESS` | `true` على VPS |
| Anti-ban | defaults في `lib/safety/*` — لا تخفّض التأخيرات دون مراجعة |

## إعادة الربط (QR)

1. أوقف الجسر: `systemctl stop whatsapp-bridge` أو `pm2 stop bridge`
2. احتفظ بنسخة من `auth-webjs/` إن أمكن
3. احذف الجلسة التالفة فقط إن لزم
4. شغّل الجسر وامسح QR من الطرفية أو السجل
5. تحقق: `curl http://127.0.0.1:3100/ready`

## ترقية المكتبة

```bash
cd whatsapp-bridge
npm install whatsapp-web.js@<target>
npm run postinstall   # patch-package
npm test
```

- راجع [whatsapp-bridge/RUNBOOK.md](../whatsapp-bridge/RUNBOOK.md)
- بعد الترقية: رسالة اختبار واردة/صادرة على staging

## مراقبة

- `GET /metrics` — Prometheus
- `GET /anti-ban/status` — مع Bearer
- تنبيه `ALERT_WEBHOOK_URL` عند فتح دائرة broadcast أو انقطاع الجلسة

## لوحة المنصة

`/platform/whatsapp-routing` — مسارات الأرقام، تخصصات، إحصائيات anti-ban.
