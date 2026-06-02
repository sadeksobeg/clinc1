#!/usr/bin/env bash
# Post-deploy verification for WhatsApp inbox fixes (run on VPS as root).
set -euo pipefail

CLINIC_OS_ROOT="${CLINIC_OS_ROOT:-/opt/clinic-os}"
cd "$CLINIC_OS_ROOT"

CONV_ID="${CONV_ID:-3}"
CLINIC_ID="${CLINIC_ID:-1}"

echo "=== 1) Postgres: conversation + messages ==="
docker exec -i clinic-os-postgres-1 psql -U postgres -d clinic_ops -c \
  "SELECT id, clinic_id, routing->>'selected_clinic_id' AS routed FROM conversations WHERE id=${CONV_ID};"
docker exec -i clinic-os-postgres-1 psql -U postgres -d clinic_ops -c \
  "SELECT id, clinic_id, direction, left(text,60) AS text FROM messages WHERE conversation_id=${CONV_ID} ORDER BY id LIMIT 10;"

echo "=== 2) ops process-inbound API ==="
TOKEN="$(grep '^SCHEDULING_SERVICE_TOKEN=' .env.prod | cut -d= -f2-)"
curl -sS -m 20 -X POST "http://127.0.0.1:3001/api/internal/conversations/process-inbound" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"clinic_id\":${CLINIC_ID},\"from\":\"verify@lid\",\"text\":\"verify-script\",\"messageId\":\"verify-$(date +%s)\",\"execute_send\":false}" \
  | head -c 500
echo ""

echo "=== 3) conversation detail (visibility) ==="
curl -sS -m 10 "http://127.0.0.1:3001/api/internal/conversations/${CONV_ID}?clinic_id=${CLINIC_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  | head -c 800
echo ""

echo "=== 4) Bridge from Docker ops container ==="
docker compose -f docker-compose.prod.yml --env-file .env.prod exec ops-dashboard \
  wget -qO- --timeout=5 http://host.docker.internal:3100/ready || echo "BRIDGE NOT REACHABLE"

echo "=== 5) Bridge metrics ==="
curl -sS http://127.0.0.1:3100/metrics | grep -E 'bridge_inbound_total|bridge_webhook_forward' || true

echo "Done."
