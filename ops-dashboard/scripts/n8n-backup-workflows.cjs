/**
 * Export n8n workflows from Docker and save timestamped JSON backup locally.
 *
 * Usage:
 *   node scripts/n8n-backup-workflows.cjs
 *
 * Optional env:
 *   N8N_DOCKER_COMPOSE_FILE=../docker-compose.clinic.yml
 *   N8N_DOCKER_SERVICE=n8n
 *   N8N_BACKUP_DIR=../backups/n8n
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const composeFile = path.resolve(
  repoRoot,
  process.env.N8N_DOCKER_COMPOSE_FILE || "docker-compose.clinic.yml",
);
const service = (process.env.N8N_DOCKER_SERVICE || "n8n").trim();
const backupDir = path.resolve(repoRoot, process.env.N8N_BACKUP_DIR || "backups/n8n");

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function runDockerExport() {
  const exportCommand = "n8n export:workflow --all --pretty --output=/tmp/workflows-export.json && cat /tmp/workflows-export.json";
  return spawnSync(
    "docker",
    ["compose", "-f", composeFile, "exec", "-T", service, "sh", "-lc", exportCommand],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
}

function main() {
  if (!fs.existsSync(composeFile)) {
    console.error(`Compose file not found: ${composeFile}`);
    process.exit(1);
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const r = runDockerExport();
  if (r.status !== 0) {
    console.error("n8n workflow export failed.");
    if (r.stderr) console.error(r.stderr.trim());
    process.exit(r.status || 1);
  }
  const rawOut = String(r.stdout || "").trim();
  const jsonStart = (() => {
    const a = rawOut.indexOf("[");
    const b = rawOut.indexOf("{");
    if (a < 0) return b;
    if (b < 0) return a;
    return Math.min(a, b);
  })();
  const out = jsonStart >= 0 ? rawOut.slice(jsonStart).trim() : "";
  if (!out.startsWith("[") && !out.startsWith("{")) {
    console.error("Unexpected n8n export output (not JSON).");
    process.exit(1);
  }
  const file = path.join(backupDir, `workflows-${stamp()}.json`);
  fs.writeFileSync(file, `${out}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, file }, null, 2));
}

main();
