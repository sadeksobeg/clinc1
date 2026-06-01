#!/usr/bin/env node
/**
 * Sync / generate production secrets for /opt/clinic-os (.env.prod + whatsapp-bridge/.env).
 *
 * Usage (on VPS from repo root):
 *   node scripts/sync-production-env.mjs --dry-run
 *   node scripts/sync-production-env.mjs --apply
 *   node scripts/sync-production-env.mjs --apply --rotate-secrets
 *
 * Safe defaults:
 *   - Backs up existing files before write
 *   - Does NOT change POSTGRES_PASSWORD unless --rotate-postgres-password
 *   - Removes SUPERADMIN_IP_ALLOWLIST_DISABLED
 *   - Sets OPS_WHATSAPP_PRIMARY_HANDLER=ops
 *   - Syncs BRIDGE_SEND_TOKEN = BRIDGE_SEND_API_TOKEN for ops + n8n + bridge
 */
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const PLACEHOLDER = /REPLACE_WITH|change-?me|changeme|^token$|^secret$/i;

function secret(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

function parseEnv(text) {
  const map = new Map();
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      lines.push({ type: "raw", line });
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      lines.push({ type: "raw", line });
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
    lines.push({ type: "kv", key });
  }
  return { map, lines };
}

function serializeEnv(map, templateLines, templateText) {
  const out = [];
  const written = new Set();
  for (const item of templateLines) {
    if (item.type === "raw") {
      out.push(item.line);
      continue;
    }
    if (map.has(item.key)) {
      out.push(`${item.key}=${map.get(item.key)}`);
      written.add(item.key);
    } else {
      const m = templateText.match(new RegExp(`^${item.key}=(.*)$`, "m"));
      out.push(m ? `${item.key}=${m[1]}` : `# ${item.key}=`);
    }
  }
  for (const [k, v] of map) {
    if (!written.has(k)) out.push(`${k}=${v}`);
  }
  return `${out.join("\n").replace(/\n+$/, "")}\n`;
}

function needsSecret(key, val, forceRotate) {
  if (forceRotate) return true;
  if (val === undefined || val === "") return true;
  if (PLACEHOLDER.test(val)) return true;
  if (["JWT_SECRET", "SCHEDULING_SERVICE_TOKEN", "BRIDGE_SEND_API_TOKEN", "BRIDGE_SEND_TOKEN"].includes(key)) {
    return val.length < 24;
  }
  return false;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function loadOrTemplate(path, fallbackPath) {
  if (existsSync(path)) return readFileSync(path, "utf8");
  if (existsSync(fallbackPath)) return readFileSync(fallbackPath, "utf8");
  return "";
}

function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const apply = args.has("--apply");
  const rotateSecrets = args.has("--rotate-secrets");
  const rotatePostgres = args.has("--rotate-postgres-password");

  if (!dryRun && !apply) {
    console.error("Specify --dry-run or --apply");
    console.error("  node scripts/sync-production-env.mjs --dry-run");
    console.error("  node scripts/sync-production-env.mjs --apply [--rotate-secrets]");
    process.exit(1);
  }

  const envProdPath = resolve(REPO_ROOT, ".env.prod");
  const envExamplePath = resolve(REPO_ROOT, ".env.prod.example");
  const bridgeEnvPath = resolve(REPO_ROOT, "whatsapp-bridge", ".env");
  const bridgeExamplePath = resolve(REPO_ROOT, "whatsapp-bridge", ".env.example");

  const prodText = loadOrTemplate(envProdPath, envExamplePath);
  if (!prodText) {
    console.error("Missing .env.prod and .env.prod.example");
    process.exit(1);
  }

  const { map: prod, lines: prodLines } = parseEnv(prodText);

  const secretKeys = [
    "JWT_SECRET",
    "SCHEDULING_SERVICE_TOKEN",
    "BRIDGE_SEND_API_TOKEN",
    "BRIDGE_SEND_TOKEN",
    "HEALTH_DEEP_TOKEN",
    "N8N_WEBHOOK_HMAC_SECRET",
  ];

  const changes = [];

  for (const key of secretKeys) {
    const cur = prod.get(key);
    if (needsSecret(key, cur, rotateSecrets)) {
      const val = secret(key === "HEALTH_DEEP_TOKEN" ? 16 : 32);
      prod.set(key, val);
      changes.push(`set ${key} (${cur ? "rotated/replaced" : "new"})`);
    }
  }

  const bridgeToken = prod.get("BRIDGE_SEND_API_TOKEN") || prod.get("BRIDGE_SEND_TOKEN");
  if (bridgeToken) {
    prod.set("BRIDGE_SEND_API_TOKEN", bridgeToken);
    prod.set("BRIDGE_SEND_TOKEN", bridgeToken);
  }

  prod.set("OPS_WHATSAPP_PRIMARY_HANDLER", "ops");
  prod.delete("SUPERADMIN_IP_ALLOWLIST_DISABLED");
  changes.push("set OPS_WHATSAPP_PRIMARY_HANDLER=ops");
  changes.push("removed SUPERADMIN_IP_ALLOWLIST_DISABLED (if present)");

  if (!prod.get("OPS_DASHBOARD_URL")) prod.set("OPS_DASHBOARD_URL", "http://ops-dashboard:3001");
  if (!prod.get("BRIDGE_INTERNAL_URL")) prod.set("BRIDGE_INTERNAL_URL", "http://host.docker.internal:3100");
  if (!prod.get("BRIDGE_SEND_URL")) prod.set("BRIDGE_SEND_URL", "http://host.docker.internal:3100");
  if (!prod.get("N8N_PUBLIC_WEBHOOK_URL")) prod.set("N8N_PUBLIC_WEBHOOK_URL", "http://127.0.0.1:5678/");
  if (!prod.get("SYSTEM_MODE")) prod.set("SYSTEM_MODE", "production");

  if (rotatePostgres) {
    const pgPass = secret(16);
    prod.set("POSTGRES_PASSWORD", pgPass);
    const user = prod.get("POSTGRES_USER") || "postgres";
    const db = prod.get("POSTGRES_DB") || "clinicsaas";
    prod.set("DATABASE_URL", `postgresql://${user}:${encodeURIComponent(pgPass)}@127.0.0.1:5432/${db}`);
    changes.push("rotated POSTGRES_PASSWORD + DATABASE_URL (requires DB user alter — advanced)");
  } else if (prod.get("POSTGRES_PASSWORD") && !prod.get("DATABASE_URL")?.includes("@")) {
    const user = prod.get("POSTGRES_USER") || "postgres";
    const db = prod.get("POSTGRES_DB") || "clinicsaas";
    const pgPass = prod.get("POSTGRES_PASSWORD");
    prod.set(
      "DATABASE_URL",
      `postgresql://${user}:${encodeURIComponent(pgPass)}@127.0.0.1:5432/${db}`,
    );
    changes.push("fixed DATABASE_URL from POSTGRES_PASSWORD");
  }

  const newProdText = serializeEnv(prod, prodLines, prodText);

  const bridgeText = loadOrTemplate(bridgeEnvPath, bridgeExamplePath);
  const { map: bridge, lines: bridgeLines } = parseEnv(bridgeText || "");
  const sched = prod.get("SCHEDULING_SERVICE_TOKEN");
  const bridgeSend = prod.get("BRIDGE_SEND_API_TOKEN");
  const n8nHmac = prod.get("N8N_WEBHOOK_HMAC_SECRET");

  if (sched) {
    bridge.set("SCHEDULING_SERVICE_TOKEN", sched);
    changes.push("bridge: SCHEDULING_SERVICE_TOKEN synced");
  }
  if (bridgeSend) {
    bridge.set("BRIDGE_SEND_API_TOKEN", bridgeSend);
    changes.push("bridge: BRIDGE_SEND_API_TOKEN synced");
  }
  if (n8nHmac) {
    bridge.set("N8N_WEBHOOK_HMAC_SECRET", n8nHmac);
    changes.push("bridge: N8N_WEBHOOK_HMAC_SECRET synced");
  }
  bridge.set("OPS_WHATSAPP_PRIMARY_HANDLER", "ops");
  bridge.set("BRIDGE_BIND_HOST", "127.0.0.1");
  bridge.set("OPS_DASHBOARD_URL", "http://127.0.0.1:3001");
  if (!bridge.get("N8N_WEBHOOK_URL")) bridge.set("N8N_WEBHOOK_URL", "http://127.0.0.1:5678/webhook/whatsapp");
  if (!bridge.get("BRIDGE_PORT")) bridge.set("BRIDGE_PORT", "3100");
  if (!bridge.get("WA_HEADLESS")) bridge.set("WA_HEADLESS", "true");

  const newBridgeText = bridgeText ? serializeEnv(bridge, bridgeLines, bridgeText) : null;

  console.log(dryRun ? "=== DRY RUN (no files written) ===" : "=== APPLY ===");
  console.log("Changes:");
  for (const c of changes) console.log(`  - ${c}`);

  if (dryRun) {
    console.log("\n.env.prod preview (secrets redacted):");
    for (const [k] of prod) {
      if (secretKeys.includes(k)) console.log(`  ${k}=*** (${prod.get(k)?.length || 0} chars)`);
      else console.log(`  ${k}=${prod.get(k)}`);
    }
    process.exit(0);
  }

  const bak = stamp();
  if (existsSync(envProdPath)) {
    copyFileSync(envProdPath, `${envProdPath}.bak-${bak}`);
    console.log(`Backup: ${envProdPath}.bak-${bak}`);
  }
  writeFileSync(envProdPath, newProdText, { mode: 0o600 });
  console.log(`Wrote: ${envProdPath}`);

  if (newBridgeText) {
    if (existsSync(bridgeEnvPath)) {
      copyFileSync(bridgeEnvPath, `${bridgeEnvPath}.bak-${bak}`);
      console.log(`Backup: ${bridgeEnvPath}.bak-${bak}`);
    }
    writeFileSync(bridgeEnvPath, newBridgeText, { mode: 0o600 });
    console.log(`Wrote: ${bridgeEnvPath}`);
  } else {
    console.warn(`Skip bridge: create ${bridgeEnvPath} from whatsapp-bridge/.env.example first`);
  }

  console.log(`
Next on VPS (/opt/clinic-os):

  node scripts/production-env-audit.mjs --file .env.prod

  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build \\
    clinic-web ops-dashboard event-consumer n8n

  # Restart WhatsApp bridge on host (pm2/systemd) after .env update

  curl -sS -o /dev/null -w "tenegta.com:%{http_code}\\n" https://tenegta.com/
  curl -sS -o /dev/null -w "tenegta.tech:%{http_code}\\n" https://tenegta.tech/
`);
}

main();
