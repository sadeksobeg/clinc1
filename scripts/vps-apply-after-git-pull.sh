#!/usr/bin/env bash
# بعد: cd /opt/clinic-os && git pull
# شغّل: sudo bash scripts/vps-apply-after-git-pull.sh
#
# 1) ينسخ snippet عنوان الزائر الموثوق إلى /etc/nginx/snippets/
# 2) يعدّل تلقائياً ملف الموقع (افتراضي: /etc/nginx/sites-available/tenegta.tech)
#    لإضافة include للـ snippet داخل كل location / يوجّه إلى clinic-web / ops
#    وحذف ترويسات proxy المكررة — دون تعديل يدوي على السيرفر
# 3) nginx -t && reload
# 4) بناء وتشغيل ops-dashboard و clinic-web

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

docker compose -f docker-compose.prod.yml --env-file .env.prod build ops-dashboard clinic-web
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d ops-dashboard clinic-web
echo "[docker] ops-dashboard + clinic-web updated"
echo "Done."
