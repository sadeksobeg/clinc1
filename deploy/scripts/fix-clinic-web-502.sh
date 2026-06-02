#!/usr/bin/env bash
# إصلاح سريع لـ 502 على tenegta.tech (clinic-web متوقف أو يعيد البناء).
# على السيرفر: sudo bash deploy/scripts/fix-clinic-web-502.sh
set -euo pipefail

CLINIC_OS_ROOT="${CLINIC_OS_ROOT:-/opt/clinic-os}"
cd "$CLINIC_OS_ROOT"

if [[ ! -f .env.prod ]]; then
  echo "ERROR: .env.prod not found in $CLINIC_OS_ROOT"
  exit 1
fi

echo "=== clinic-web / ops-dashboard status ==="
docker compose -f docker-compose.prod.yml --env-file .env.prod ps ops-dashboard clinic-web || true

echo ""
echo "=== restart + wait for :3000 ==="
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d ops-dashboard clinic-web

WEB_OK=0
for i in $(seq 1 60); do
  if curl -sf -m 3 -o /dev/null http://127.0.0.1:3000/login 2>/dev/null; then
    WEB_OK=1
    echo "OK: clinic-web responds on http://127.0.0.1:3000/login"
    break
  fi
  echo "  waiting... ($i/60)"
  sleep 2
done

if [[ "$WEB_OK" -ne 1 ]]; then
  echo ""
  echo "FAIL: clinic-web still down. Last logs:"
  docker compose -f docker-compose.prod.yml --env-file .env.prod logs clinic-web --tail 60
  exit 1
fi

echo ""
echo "=== nginx reload ==="
nginx -t && systemctl reload nginx
echo "Done. Test: curl -sI https://tenegta.tech/login"
