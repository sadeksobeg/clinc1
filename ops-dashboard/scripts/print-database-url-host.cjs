#!/usr/bin/env node
/**
 * Prints a DATABASE_URL for connections from the VPS host to Postgres
 * (127.0.0.1 + published port + credentials from .env.prod).
 *
 *   export DATABASE_URL="$(node scripts/print-database-url-host.cjs)"
 *   export DATABASE_URL="$(node scripts/print-database-url-host.cjs /opt/clinic-os/.env.prod)"
 */
const fs = require("fs");
const path = require("path");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing env file: ${filePath}`);
    process.exit(1);
  }
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const defaultPath = path.resolve(__dirname, "..", "..", ".env.prod");
const envPath = process.argv[2] || defaultPath;
const env = parseEnvFile(envPath);

const user = env.POSTGRES_USER || "postgres";
const pass = env.POSTGRES_PASSWORD || "";
const db = env.POSTGRES_DB || "clinicsaas";
const port = String(env.POSTGRES_PUBLISH_PORT || "5432").trim() || "5432";

if (!pass) {
  console.error("POSTGRES_PASSWORD is empty in env file");
  process.exit(1);
}

const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@127.0.0.1:${port}/${encodeURIComponent(db)}`;
process.stdout.write(url);
