#!/usr/bin/env bash
# Run release gates from repo root (VPS or CI-like host with ops + web on localhost).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [[ -f .env.prod ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^(SCHEDULING_SERVICE_TOKEN|HEALTH_DEEP_TOKEN|OPS_DASHBOARD_URL)=' .env.prod | sed 's/\r$//')
  set +a
fi

export NODE_ENV=production

echo "=== audit:production-env ==="
if [[ -f .env.prod ]]; then
  npm run audit:production-env -- --file .env.prod
else
  npm run audit:production-env
fi

echo "=== e2e:go-live-smoke ==="
npm run e2e:go-live-smoke

echo "=== gate:p7 ==="
npm run gate:p7

echo "=== ops:go-live-preflight ==="
(cd ops-dashboard && npm run ops:go-live-preflight)

echo "=== All gates completed ==="
