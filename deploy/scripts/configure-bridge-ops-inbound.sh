#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# يضبط whatsapp-bridge/.env للوارد المباشر إلى ops-dashboard (بدون n8n).
# يقرأ SCHEDULING_SERVICE_TOKEN وبيانات Postgres من .env.prod في جذر المشروع.
#
# الاستخدام على السيرفر:
#   cd /opt/clinic-os
#   sudo bash deploy/scripts/configure-bridge-ops-inbound.sh
#   sudo bash deploy/scripts/configure-bridge-ops-inbound.sh --restart
#
# أو بعد رفع الملف فقط:
#   sudo bash /opt/clinic-os/deploy/scripts/configure-bridge-ops-inbound.sh --restart
# -----------------------------------------------------------------------------
set -euo pipefail

CLINIC_OS_ROOT="${CLINIC_OS_ROOT:-/opt/clinic-os}"
PROD_ENV="${PROD_ENV:-$CLINIC_OS_ROOT/.env.prod}"
BRIDGE_ENV="${BRIDGE_ENV:-$CLINIC_OS_ROOT/whatsapp-bridge/.env}"
DO_RESTART=0

for arg in "$@"; do
  case "$arg" in
    --restart) DO_RESTART=1 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (use --restart or --help)" >&2
      exit 1
      ;;
  esac
done

die() {
  echo "ERROR: $*" >&2
  exit 1
}

# Read KEY=value from .env (first match); strips optional quotes.
read_env_val() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 1
  local line
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | head -n1 || true)"
  [[ -n "$line" ]] || return 1
  local val="${line#*=}"
  val="${val%$'\r'}"
  if [[ "$val" =~ ^\".*\"$ ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" =~ ^\'.*\'$ ]]; then
    val="${val:1:${#val}-2}"
  fi
  printf '%s' "$val"
}

upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  touch "$file"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    grep -vE "^${key}=" "$file" >"$tmp" || true
  else
    cp "$file" "$tmp" 2>/dev/null || : >"$tmp"
  fi
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  mv "$tmp" "$file"
  chmod 600 "$file" 2>/dev/null || true
}

[[ -f "$PROD_ENV" ]] || die "Missing $PROD_ENV — create from .env.prod.example first."

TOKEN="$(read_env_val "$PROD_ENV" SCHEDULING_SERVICE_TOKEN || true)"
[[ -n "$TOKEN" ]] || die "SCHEDULING_SERVICE_TOKEN is empty or missing in $PROD_ENV"

OPS_PORT="$(read_env_val "$PROD_ENV" OPS_PUBLISH_PORT || echo "3001")"
OPS_URL="http://127.0.0.1:${OPS_PORT}"

PG_USER="$(read_env_val "$PROD_ENV" POSTGRES_USER || echo "postgres")"
PG_PASS="$(read_env_val "$PROD_ENV" POSTGRES_PASSWORD || true)"
PG_HOST="$(read_env_val "$PROD_ENV" CRM_DB_HOST || echo "127.0.0.1")"
PG_PORT="$(read_env_val "$PROD_ENV" CRM_DB_PORT || read_env_val "$PROD_ENV" POSTGRES_PUBLISH_PORT || echo "5432")"
BRIDGE_SEND="$(read_env_val "$PROD_ENV" BRIDGE_SEND_API_TOKEN || read_env_val "$PROD_ENV" BRIDGE_SEND_TOKEN || true)"
HMAC_SECRET="$(read_env_val "$PROD_ENV" N8N_WEBHOOK_HMAC_SECRET || true)"
CLINIC_ID="$(read_env_val "$PROD_ENV" CLINIC_ID || echo "1")"

mkdir -p "$(dirname "$BRIDGE_ENV")"
if [[ ! -f "$BRIDGE_ENV" ]]; then
  EXAMPLE="$CLINIC_OS_ROOT/whatsapp-bridge/.env.example"
  if [[ -f "$EXAMPLE" ]]; then
    cp "$EXAMPLE" "$BRIDGE_ENV"
    chmod 600 "$BRIDGE_ENV"
    echo "Created $BRIDGE_ENV from .env.example"
  else
    touch "$BRIDGE_ENV"
    chmod 600 "$BRIDGE_ENV"
    echo "Created empty $BRIDGE_ENV"
  fi
fi

BACKUP="${BRIDGE_ENV}.bak.$(date +%Y%m%d-%H%M%S)"
cp "$BRIDGE_ENV" "$BACKUP"
echo "Backup: $BACKUP"

upsert_env "$BRIDGE_ENV" OPS_WHATSAPP_PRIMARY_HANDLER ops
upsert_env "$BRIDGE_ENV" OPS_DASHBOARD_URL "$OPS_URL"
upsert_env "$BRIDGE_ENV" SCHEDULING_SERVICE_TOKEN "$TOKEN"
upsert_env "$BRIDGE_ENV" CRM_DB_NAME clinic_ops
upsert_env "$BRIDGE_ENV" CRM_DB_HOST "$PG_HOST"
upsert_env "$BRIDGE_ENV" CRM_DB_PORT "$PG_PORT"
upsert_env "$BRIDGE_ENV" CRM_DB_USER "$PG_USER"
[[ -n "$PG_PASS" ]] && upsert_env "$BRIDGE_ENV" CRM_DB_PASSWORD "$PG_PASS"
upsert_env "$BRIDGE_ENV" CLINIC_ID "$CLINIC_ID"
upsert_env "$BRIDGE_ENV" BRIDGE_BIND_HOST "0.0.0.0"
[[ -n "$BRIDGE_SEND" ]] && upsert_env "$BRIDGE_ENV" BRIDGE_SEND_API_TOKEN "$BRIDGE_SEND"
[[ -n "$HMAC_SECRET" ]] && upsert_env "$BRIDGE_ENV" N8N_WEBHOOK_HMAC_SECRET "$HMAC_SECRET"

# ops mode: bridge posts process-inbound (see whatsapp-bridge/lib/config.js)
if grep -qE '^BRIDGE_INBOUND_FORWARD=' "$BRIDGE_ENV" 2>/dev/null; then
  upsert_env "$BRIDGE_ENV" BRIDGE_INBOUND_FORWARD ops
fi

# Disable misleading n8n URL if present (optional comment — keep line for later n8n)
if grep -qE '^N8N_WEBHOOK_URL=' "$BRIDGE_ENV" 2>/dev/null; then
  tmp="$(mktemp)"
  sed -E 's|^N8N_WEBHOOK_URL=|# N8N_WEBHOOK_URL= (ops direct inbound; uncomment for n8n) |' "$BRIDGE_ENV" >"$tmp"
  mv "$tmp" "$BRIDGE_ENV"
  chmod 600 "$BRIDGE_ENV" 2>/dev/null || true
fi

echo ""
echo "Updated $BRIDGE_ENV:"
grep -E '^(OPS_WHATSAPP_PRIMARY_HANDLER|OPS_DASHBOARD_URL|SCHEDULING_SERVICE_TOKEN|CRM_DB_NAME|CRM_DB_HOST|CRM_DB_PORT|CRM_DB_USER|BRIDGE_BIND_HOST)=' "$BRIDGE_ENV" || true
echo "(SCHEDULING_SERVICE_TOKEN and CRM_DB_PASSWORD are set but not printed.)"
echo ""

if [[ "$DO_RESTART" -eq 1 ]]; then
  if systemctl is-active --quiet whatsapp-bridge 2>/dev/null; then
    systemctl restart whatsapp-bridge
    echo "Restarted whatsapp-bridge"
    sleep 2
    systemctl --no-pager --full status whatsapp-bridge | head -n 12 || true
  else
    echo "Note: whatsapp-bridge systemd unit not active — restart manually (pm2/systemctl)."
  fi
else
  echo "Run with --restart to apply: systemctl restart whatsapp-bridge"
fi

echo ""
echo "Smoke test (ops process-inbound):"
echo "  curl -sS -X POST ${OPS_URL}/api/internal/conversations/process-inbound \\"
echo "    -H \"Authorization: Bearer <token>\" -H \"Content-Type: application/json\" \\"
echo "    -d '{\"clinic_id\":1,\"from\":\"test@lid\",\"text\":\"ping\",\"messageId\":\"cfg-test\"}'"
