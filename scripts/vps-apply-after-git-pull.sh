#!/usr/bin/env bash
# بعد: cd /opt/clinic-os && git pull
# شغّل: sudo bash scripts/vps-apply-after-git-pull.sh
#
# 1) ينسخ snippet عنوان الزائر الموثوق إلى /etc/nginx/snippets/
# 2) يعدّل تلقائياً ملف الموقع (افتراضي: /etc/nginx/sites-available/tenegta.tech)
#    لإضافة include للـ snippet داخل كل location / يوجّه إلى clinic-web / ops
#    وحذف ترويسات proxy المكررة — دون تعديل يدوي على السيرفر
# 3) nginx -t && reload
# 4) إعادة تشغيل خدمة whatsapp-bridge على المضيف (إن وُجدت) لتفعيل BRIDGE_BIND_HOST=0.0.0.0
# 5) بناء وتشغيل ops-dashboard و clinic-web

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/tenegta.tech}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/vps-apply-after-git-pull.sh"
  exit 1
fi

mkdir -p /etc/nginx/snippets
cp -f "$REPO_ROOT/deploy/nginx/snippets/proxy-to-nextjs-cloudflare.conf" /etc/nginx/snippets/proxy-to-nextjs-cloudflare.conf
echo "[nginx] Snippet synced to /etc/nginx/snippets/proxy-to-nextjs-cloudflare.conf"

if [[ -f "$NGINX_SITE" ]]; then
  if ! command -v python3 >/dev/null 2>&1; then
    echo "[nginx] ERROR: python3 is required to patch $NGINX_SITE (install: apt install python3)"
    exit 1
  fi
  python3 "$REPO_ROOT/scripts/nginx-ensure-trusted-ip-snippet.py" "$NGINX_SITE"
else
  echo "[nginx] WARN: $NGINX_SITE not found — skipped auto-patch. Set NGINX_SITE=... or create the site file."
fi

nginx -t
systemctl reload nginx
echo "[nginx] reloaded OK"

# Restart WhatsApp bridge on the host (if running as a systemd service) so it picks up
# BRIDGE_BIND_HOST default (0.0.0.0), making :3100 reachable from ops-dashboard container.
BRIDGE_SERVICE="${BRIDGE_SERVICE:-whatsapp-bridge}"
if systemctl list-unit-files | grep -q "^${BRIDGE_SERVICE}\.service"; then
  systemctl restart "${BRIDGE_SERVICE}"
  echo "[bridge] ${BRIDGE_SERVICE} restarted"
  sleep 2
  if ss -tlnp 2>/dev/null | grep -q ":3100"; then
    if ss -tlnp 2>/dev/null | grep ":3100" | grep -Eq "0\.0\.0\.0:3100|\*:3100|\[::\]:3100"; then
      echo "[bridge] listening on all interfaces (:3100)"
    else
      echo "[bridge] WARN: :3100 is bound to 127.0.0.1 only — set BRIDGE_BIND_HOST=0.0.0.0 in whatsapp-bridge/.env"
    fi
  else
    echo "[bridge] WARN: nothing listening on :3100 after restart — check 'journalctl -u ${BRIDGE_SERVICE} -n 50'"
  fi
else
  echo "[bridge] systemd unit ${BRIDGE_SERVICE}.service not found — skipping restart (override with BRIDGE_SERVICE=<unit>)"
fi

docker compose -f docker-compose.prod.yml --env-file .env.prod build ops-dashboard clinic-web
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d ops-dashboard clinic-web
echo "[docker] ops-dashboard + clinic-web updated"
echo "Done."
