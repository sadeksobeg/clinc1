#!/usr/bin/env bash
# Phase A — production closeout on VPS (/opt/clinic-os).
set -euo pipefail

CLINIC_OS_ROOT="${CLINIC_OS_ROOT:-/opt/clinic-os}"
cd "$CLINIC_OS_ROOT"

echo "=== Phase A: production closeout ==="

if [[ ! -f .env.prod ]]; then
  echo "Missing .env.prod in $CLINIC_OS_ROOT" >&2
  exit 1
fi

echo "--- 1) Bridge + ops connectivity ---"
bash deploy/scripts/verify-inbox-whatsapp-fixes.sh

echo "--- 2) iptables (optional persist) ---"
if [[ "$(id -u)" -eq 0 ]]; then
  bash scripts/ufw-allow-bridge-from-docker.sh
  if command -v netfilter-persistent >/dev/null 2>&1; then
    PERSIST_IPTABLES=1 bash scripts/ufw-allow-bridge-from-docker.sh || true
  fi
else
  echo "Run as root for iptables: sudo bash scripts/ufw-allow-bridge-from-docker.sh"
fi

echo "--- 3) Production env audit (repo root) ---"
if command -v npm >/dev/null 2>&1; then
  NODE_ENV=production npm run audit:production-env -- --file .env.prod || true
fi

echo "--- 4) Secret sync (dry-run) ---"
if [[ -f scripts/sync-production-env.mjs ]]; then
  node scripts/sync-production-env.mjs --dry-run || true
  echo "Apply on VPS when ready: node scripts/sync-production-env.mjs --apply --rotate-secrets"
fi

echo "--- 5) Manual UAT reminder ---"
echo "  - Inbox: https://tenegta.tech/inbox in Clinic mode (not Global)"
echo "  - Checklist: MANUAL_UAT_LAUNCH_CHECKLIST_AR.txt"
echo "  - Test DB cleanup: bash deploy/scripts/cleanup-test-conversations.sh"

echo "=== Phase A script finished ==="
