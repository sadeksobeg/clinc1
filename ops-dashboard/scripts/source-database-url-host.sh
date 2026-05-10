#!/usr/bin/env sh
# Usage (from repo):   . ops-dashboard/scripts/source-database-url-host.sh
# With explicit file:   . ops-dashboard/scripts/source-database-url-host.sh /opt/clinic-os/.env.prod
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
ENVFILE="${1:-$ROOT/.env.prod}"
export DATABASE_URL="$(node "$SCRIPT_DIR/print-database-url-host.cjs" "$ENVFILE")"
