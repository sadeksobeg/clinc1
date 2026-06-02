# تشغيل عدة عيادات على جسر واتساب واحد أو أكثر

## نموذج اليوم (عيادة واحدة)

- خدمة systemd واحدة: `whatsapp-bridge` على `0.0.0.0:3100`
- صف في `whatsapp_inbound_routes` (migration 046): `+963939448113` → `hub_clinic_id=1`

## توسيع لعدة خطوط WA

1. **صف route لكل رقم** في `whatsapp_inbound_routes` (`to_number` E.164، `hub_clinic_id`, `allowed_clinic_ids`).
2. **خيار A — جسر واحد، جلسة واحدة:** مناسب إن كل الأرقام على نفس حساب WA Business (نادر مع web.js).
3. **خيار B — عدة عمليات جسر (موصى به لعدة أرقام):**
   - نسخ مجلد `whatsapp-bridge` أو نفس المستودع مع `.env` مختلف: `BRIDGE_PORT`, `SESSION_DIR`, `CRM_DB_NAME`.
   - systemd unit لكل instance: `whatsapp-bridge@clinic2.service`
   - ops: `BRIDGE_INTERNAL_URL` يبقى للجسر الافتراضي؛ routing يحدد العيادة من `to_number` في inbound.

## PM2 مثال (مضيف)

```bash
cd /opt/clinic-os/whatsapp-bridge
BRIDGE_PORT=3100 BRIDGE_SESSION_DIR=/var/lib/wa-clinic1 node index.js
BRIDGE_PORT=3101 BRIDGE_SESSION_DIR=/var/lib/wa-clinic2 node index.js
```

## شبكة Docker

لكل جسر على منفذ host مختلف، أضف iptables لنفس subnet compose (سكربت `scripts/ufw-allow-bridge-from-docker.sh` يدعم `BRIDGE_PORT=3101`).

## مراقبة

- `bridge_inbound_total` لكل instance
- deep health في ops-dashboard
