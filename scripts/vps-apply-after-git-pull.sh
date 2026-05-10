#!/usr/bin/env bash
# بعد: cd /opt/clinic-os && git pull
# شغّل: sudo bash scripts/vps-apply-after-git-pull.sh
# ينسخ snippet nginx (عنوان زائر موثوق عبر CF-Connecting-IP / تجاهل سلسلة XFF المزيّفة)،
# يحقن CF-Connecting-IP في الموقع إن كان مفقودًا، يعيد تحميل nginx، ثم يبني ويشغّل الحاويات.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/tenegta.tech}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/vps-apply-after-git-pull.sh"
  exit 1
fi

if [[ -f "$NGINX_SITE" ]]; then
  if grep -q 'proxy_set_header CF-Connecting-IP' "$NGINX_SITE"; then
    echo "[nginx] CF-Connecting-IP already present in $NGINX_SITE"
  else
    cp -a "$NGINX_SITE" "$NGINX_SITE.bak.cf-$(date +%Y%m%d%H%M%S)"
    sed -i '/proxy_set_header X-Forwarded-Proto \$scheme;/a\    proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;' "$NGINX_SITE"
    echo "[nginx] Injected CF-Connecting-IP into $NGINX_SITE (backup created)"
  fi
else
  echo "[nginx] WARN: $NGINX_SITE not found — skip inject. Add CF-Connecting-IP manually or fix NGINX_SITE env."
fi

mkdir -p /etc/nginx/snippets
cp -f "$REPO_ROOT/deploy/nginx/snippets/proxy-to-nextjs-cloudflare.conf" /etc/nginx/snippets/proxy-to-nextjs-cloudflare.conf
echo "[nginx] Snippet synced to /etc/nginx/snippets/proxy-to-nextjs-cloudflare.conf"

nginx -t
systemctl reload nginx
echo "[nginx] reloaded OK"

docker compose -f docker-compose.prod.yml --env-file .env.prod build ops-dashboard clinic-web
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d ops-dashboard clinic-web
echo "[docker] ops-dashboard + clinic-web updated"
echo "Done."
