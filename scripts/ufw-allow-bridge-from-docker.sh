#!/usr/bin/env bash
# يكتشف subnet لشبكة docker-compose الخاصة بالمشروع، ويضيف قاعدة UFW واحدة
# للسماح لـ ops-dashboard (والحاويات الأخرى داخل نفس الشبكة) بالوصول إلى الجسر
# على المضيف (المنفذ ${BRIDGE_PORT:-3100}).
#
# يُستدعى تلقائياً من scripts/vps-apply-after-git-pull.sh عندما يكون UFW فعّالاً.
# للتشغيل اليدوي:
#   sudo bash scripts/ufw-allow-bridge-from-docker.sh
#
# Idempotent — يتحقق من وجود القاعدة قبل الإضافة (يقارن وصف القاعدة `comment`).

set -euo pipefail

PORT="${BRIDGE_PORT:-3100}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
COMMENT_TAG="clinic-os: docker -> bridge :${PORT}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/ufw-allow-bridge-from-docker.sh"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ufw] docker CLI not found — aborting." >&2
  exit 1
fi

NETWORK_NAME=""
if [[ -f "$COMPOSE_FILE" && -f "$ENV_FILE" ]]; then
  NETWORK_NAME="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    ps --format json 2>/dev/null \
    | python3 -c "import sys,json;
data=[json.loads(l) for l in sys.stdin if l.strip()]
nets=set()
for c in data:
    for n in (c.get('Networks') or '').split(','):
        n=n.strip()
        if n: nets.add(n)
print(next(iter(nets)) if nets else '')" 2>/dev/null || true)"
fi

if [[ -z "$NETWORK_NAME" ]]; then
  PROJECT_NAME="$(basename "$REPO_ROOT")"
  NETWORK_NAME="${PROJECT_NAME}_default"
fi

if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  echo "[ufw] docker network '$NETWORK_NAME' not found — bring the stack up first:" >&2
  echo "      docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d" >&2
  exit 1
fi

SUBNET="$(docker network inspect "$NETWORK_NAME" \
  --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' \
  | awk '{print $1}')"

if [[ -z "$SUBNET" ]]; then
  echo "[ufw] could not detect subnet for network '$NETWORK_NAME'." >&2
  exit 1
fi

echo "[bridge-net] docker network: $NETWORK_NAME (subnet: $SUBNET)"

if ! command -v ufw >/dev/null 2>&1; then
  echo "[ufw] not installed — using iptables only."
elif ! ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "[ufw] inactive — using iptables only."
elif ufw status verbose 2>/dev/null | grep -qF "$COMMENT_TAG"; then
  echo "[ufw] rule already present."
else
  ufw allow from "$SUBNET" to any port "$PORT" proto tcp comment "$COMMENT_TAG"
  echo "[ufw] allowed $SUBNET -> :$PORT/tcp"
  ufw reload >/dev/null 2>&1 || true
fi

# UFW alone often does not allow container -> host:PORT on Linux (Docker bypasses FORWARD).
# Always ensure a direct INPUT allow (idempotent).
if iptables -C INPUT -s "$SUBNET" -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; then
  echo "[iptables] INPUT allow $SUBNET -> :$PORT already present."
else
  iptables -I INPUT 1 -s "$SUBNET" -p tcp --dport "$PORT" -j ACCEPT
  echo "[iptables] added INPUT allow $SUBNET -> :$PORT/tcp"
fi

if command -v ss >/dev/null 2>&1; then
  if ! ss -tlnp 2>/dev/null | grep -E ":${PORT}\b" | grep -Eq "0\.0\.0\.0:${PORT}|\*:${PORT}|\[::\]:${PORT}"; then
    echo "[ufw] WARN: nothing on host listens on 0.0.0.0:${PORT} — check BRIDGE_BIND_HOST in whatsapp-bridge/.env"
  fi
fi

if [[ "${PERSIST_IPTABLES:-}" == "1" ]]; then
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save
    echo "[iptables] saved via netfilter-persistent."
  elif [[ -d /etc/iptables ]]; then
    iptables-save > /etc/iptables/rules.v4
    echo "[iptables] saved to /etc/iptables/rules.v4"
  else
    echo "[iptables] install netfilter-persistent or save rules manually after reboot." >&2
  fi
fi

echo "[ufw] done."
echo "[hint] Use BRIDGE_INTERNAL_URL=http://<Gateway>:${PORT} in .env.prod (IPv4), not host.docker.internal (may resolve to IPv6)."
echo "[hint] Persist iptables: sudo PERSIST_IPTABLES=1 bash scripts/ufw-allow-bridge-from-docker.sh"
