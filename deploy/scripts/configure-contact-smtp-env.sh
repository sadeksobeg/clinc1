#!/usr/bin/env bash
# يضيف/يحدّث متغيرات SMTP لنموذج التواصل في .env.prod
# على السيرفر:
#   cd /opt/clinic-os && git pull
#   SMTP_PASS='كلمة_مرور_صندوق_البريد' sudo -E bash deploy/scripts/configure-contact-smtp-env.sh
#   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d clinic-web
set -euo pipefail

CLINIC_OS_ROOT="${CLINIC_OS_ROOT:-/opt/clinic-os}"
ENV_FILE="${ENV_FILE:-$CLINIC_OS_ROOT/.env.prod}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy from .env.prod.example first."
  exit 1
fi

CONTACT_TO_EMAIL="${CONTACT_TO_EMAIL:-info@tenegta.com}"
SMTP_HOST="${SMTP_HOST:-smtp.hostinger.com}"
SMTP_PORT="${SMTP_PORT:-465}"
SMTP_SECURE="${SMTP_SECURE:-true}"
SMTP_USER="${SMTP_USER:-info@tenegta.com}"
SMTP_FROM="${SMTP_FROM:-\"نسق <info@tenegta.com>\"}"

if [[ -z "${SMTP_PASS:-}" ]]; then
  echo "WARN: SMTP_PASS not set. Pass: SMTP_PASS='your-mailbox-password' sudo -E bash $0"
  echo "      Contact form will return mail_not_configured until SMTP_PASS is set."
fi

python3 - "$ENV_FILE" <<'PY'
import os
import re
import sys
from datetime import datetime

path = sys.argv[1]
text = open(path, encoding="utf-8").read()

keys = {
    "CONTACT_TO_EMAIL": os.environ.get("CONTACT_TO_EMAIL", "info@tenegta.com"),
    "SMTP_HOST": os.environ.get("SMTP_HOST", "smtp.hostinger.com"),
    "SMTP_PORT": os.environ.get("SMTP_PORT", "465"),
    "SMTP_SECURE": os.environ.get("SMTP_SECURE", "true"),
    "SMTP_USER": os.environ.get("SMTP_USER", "info@tenegta.com"),
    "SMTP_FROM": os.environ.get("SMTP_FROM", '"نسق <info@tenegta.com>"'),
}
if os.environ.get("SMTP_PASS"):
    keys["SMTP_PASS"] = os.environ["SMTP_PASS"]

block_header = "\n# --- نموذج التواصل (clinic-web → info@tenegta.com) — added by configure-contact-smtp-env.sh ---\n"
lines_out = []
seen = set()
for raw in text.splitlines():
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=", raw)
    if m and m.group(1) in keys:
        k = m.group(1)
        lines_out.append(f"{k}={keys.pop(k)}")
        seen.add(k)
    else:
        lines_out.append(raw)

if keys:
    if block_header.strip() not in text:
        lines_out.append(block_header.rstrip())
    for k, v in keys.items():
        if k not in seen:
            lines_out.append(f"{k}={v}")

new_text = "\n".join(lines_out).rstrip() + "\n"
bak = f"{path}.bak-contact-smtp-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
open(bak, "w", encoding="utf-8").write(text)
open(path, "w", encoding="utf-8").write(new_text)
print(f"Updated: {path}")
print(f"Backup: {bak}")
for k in ("CONTACT_TO_EMAIL", "SMTP_HOST", "SMTP_USER"):
    print(f"  {k}={keys.get(k) or 'set'}")
if os.environ.get("SMTP_PASS"):
    print("  SMTP_PASS=*** (set)")
else:
    print("  SMTP_PASS=(unchanged or empty — set via SMTP_PASS=... env)")
PY

echo ""
echo "Restart clinic-web to apply:"
echo "  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d clinic-web"
