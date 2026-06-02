#!/usr/bin/env bash
# Backup Postgres (clinic_ops), n8n volume, and env files from /opt/clinic-os.
set -euo pipefail

CLINIC_OS_ROOT="${CLINIC_OS_ROOT:-/opt/clinic-os}"
BACKUP_DIR="${BACKUP_DIR:-$CLINIC_OS_ROOT/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/clinic-os-$STAMP"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-clinic-os-postgres-1}"
DB_NAME="${POSTGRES_DB:-clinic_ops}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"

mkdir -p "$DEST"
cd "$CLINIC_OS_ROOT"

echo "Backing up to $DEST"

if docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  docker exec "$POSTGRES_CONTAINER" pg_dump -U postgres -Fc "$DB_NAME" > "$DEST/${DB_NAME}.dump"
  echo "  Postgres: ${DB_NAME}.dump"
else
  echo "  WARN: Postgres container not running — skipped DB dump" >&2
fi

if [[ -f .env.prod ]]; then
  cp -a .env.prod "$DEST/.env.prod.redacted.bak"
  sed -E 's/(PASSWORD|TOKEN|SECRET)=.*/\1=***REDACTED***/' "$DEST/.env.prod.redacted.bak" > "$DEST/.env.prod.meta"
fi
if [[ -f whatsapp-bridge/.env ]]; then
  cp -a whatsapp-bridge/.env "$DEST/whatsapp-bridge.env.bak"
fi

N8N_VOL="$(docker volume ls -q | grep -E 'clinic.*n8n|n8n.*prod' | head -1 || true)"
if [[ -n "$N8N_VOL" ]]; then
  docker run --rm -v "${N8N_VOL}:/data" -v "$DEST:/backup" alpine \
    tar -czf "/backup/n8n-data.tgz" -C /data .
  echo "  n8n volume: n8n-data.tgz"
fi

echo "Backup complete: $DEST"
