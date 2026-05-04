/**
 * Fast sanity check to ensure n8n workflow JSON does not contain hardcoded secrets.
 *
 * Usage:
 *   node scripts/n8n-env-sanity.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const workflowPath = path.resolve(__dirname, "..", "..", "whatsapp-bridge", "n8n-workflow-whatsapp-local.json");

const suspicious = [
  /Bearer\s+[A-Za-z0-9_\-]{16,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /api[_-]?key["']?\s*[:=]\s*["'][^"']{8,}["']/gi,
  /secret["']?\s*[:=]\s*["'][^"']{8,}["']/gi,
];

function main() {
  if (!fs.existsSync(workflowPath)) {
    console.error(`Workflow file missing: ${workflowPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(workflowPath, "utf8");
  const hits = [];
  for (const pattern of suspicious) {
    const m = content.match(pattern);
    if (m && m.length) hits.push(...m.slice(0, 5));
  }
  const out = {
    ok: hits.length === 0,
    checked_file: workflowPath,
    findings: hits,
    required_envs: [
      "SCHEDULING_SERVICE_TOKEN",
      "N8N_WEBHOOK_HMAC_SECRET",
      "BRIDGE_SEND_API_TOKEN",
      "OPS_DASHBOARD_URL",
      "BRIDGE_SEND_URL",
    ],
  };
  console.log(JSON.stringify(out, null, 2));
  if (hits.length > 0) process.exit(1);
}

main();
