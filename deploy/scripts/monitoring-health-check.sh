#!/usr/bin/env bash
# Lightweight monitoring probe for cron (exit 1 on critical failure).
set -euo pipefail

CLINIC_OS_ROOT="${CLINIC_OS_ROOT:-/opt/clinic-os}"
cd "$CLINIC_OS_ROOT"

FAIL=0
TOKEN=""
if [[ -f .env.prod ]]; then
  TOKEN="$(grep '^SCHEDULING_SERVICE_TOKEN=' .env.prod | cut -d= -f2- | tr -d '\r')"
fi

check() {
  local name="$1"
  shift
  if "$@"; then
    echo "[ok] $name"
  else
    echo "[FAIL] $name" >&2
    FAIL=1
  fi
}

check "bridge /ready" curl -sf -m 5 http://127.0.0.1:3100/ready >/dev/null

if [[ -n "$TOKEN" ]]; then
  check "ops shallow" curl -sf -m 10 -H "Authorization: Bearer $TOKEN" \
    http://127.0.0.1:3001/api/internal/inbox?clinic_id=1\&limit=1 >/dev/null
  check "ops deep health" curl -sf -m 20 -H "Authorization: Bearer $TOKEN" \
    http://127.0.0.1:3001/api/system/health/deep >/dev/null
else
  echo "[skip] ops checks — no SCHEDULING_SERVICE_TOKEN in .env.prod"
fi

check "clinic-web" curl -sf -m 10 -o /dev/null http://127.0.0.1:3000/login

METRICS="$(curl -sf -m 5 http://127.0.0.1:3100/metrics 2>/dev/null || true)"
if echo "$METRICS" | grep -q 'bridge_webhook_forward_fail_total'; then
  FAILS="$(echo "$METRICS" | awk '/^bridge_webhook_forward_fail_total /{print $2}')"
  if [[ "${FAILS:-0}" != "0" ]] && [[ "${FAILS%%.*}" -gt 10 ]]; then
    echo "[FAIL] bridge_webhook_forward_fail_total=$FAILS" >&2
    FAIL=1
  else
    echo "[ok] bridge forward failures ($FAILS)"
  fi
fi

if docker compose -f docker-compose.prod.yml --env-file .env.prod ps 2>/dev/null | grep -q 'ops-dashboard'; then
  if ! docker compose -f docker-compose.prod.yml --env-file .env.prod ps ops-dashboard 2>/dev/null | grep -q 'running'; then
    echo "[FAIL] ops-dashboard not running" >&2
    FAIL=1
  else
    echo "[ok] ops-dashboard container"
  fi
fi

exit "$FAIL"
