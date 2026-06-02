#!/usr/bin/env bash
# Install monitoring-health-check.cron under /etc/cron.d/
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/scripts/install-monitoring-cron.sh"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON_FILE="/etc/cron.d/clinic-os-monitoring"

cat > "$CRON_FILE" <<EOF
# Clinic OS health probe — logs to /var/log/clinic-os-monitoring.log
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
0 */6 * * * root CLINIC_OS_ROOT=$REPO_ROOT $REPO_ROOT/deploy/scripts/monitoring-health-check.sh >> /var/log/clinic-os-monitoring.log 2>&1
EOF

chmod 644 "$CRON_FILE"
echo "Installed $CRON_FILE (every 6 hours)."
echo "Log: /var/log/clinic-os-monitoring.log"
