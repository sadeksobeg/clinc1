#!/usr/bin/env bash
# Archive/delete test @lid conversations on clinic_ops (see deploy/sql/cleanup-test-inbox-conversations.sql).
set -euo pipefail

CLINIC_OS_ROOT="${CLINIC_OS_ROOT:-/opt/clinic-os}"
DB_NAME="${POSTGRES_DB:-clinic_ops}"
CONTAINER="${POSTGRES_CONTAINER:-clinic-os-postgres-1}"

cd "$CLINIC_OS_ROOT"
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Postgres container '$CONTAINER' not running." >&2
  exit 1
fi

echo "Preview (dry-run style) — patients matching test patterns:"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB_NAME" -c \
  "SELECT id, chat_id, display_name FROM patients WHERE chat_id ILIKE '%@lid' AND (chat_id ILIKE 'test@%' OR chat_id ILIKE 'finalcheck@%' OR chat_id ILIKE 'verify@%');"

read -r -p "Delete these test patients and their messages? [y/N] " ans
if [[ "${ans,,}" != "y" ]]; then
  echo "Aborted."
  exit 0
fi

docker exec -i "$CONTAINER" psql -U postgres -d "$DB_NAME" \
  < deploy/sql/cleanup-test-inbox-conversations.sql

echo "Done."
