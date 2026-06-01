/**
 * Applies Phase 1 security/routing SQL only (idempotent migrations).
 *   cd ops-dashboard && node scripts/apply-phase1-security-migrations.cjs
 */
const fs = require("fs");
const path = require("path");
require("./load-ops-env.cjs");
const { Client } = require("pg");

const sqlRoot = path.resolve(__dirname, "..", "..", "whatsapp-bridge", "sql");
const files = [
  "migrations/005_core_outbox_blocked_status.sql",
  "migrations/036_super_admin_security.sql",
  "migrations/045_specialty_routing.sql",
];

async function main() {
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const rel of files) {
      const full = path.join(sqlRoot, rel);
      console.log("Applying:", rel);
      await client.query(fs.readFileSync(full, "utf8"));
      console.log("OK:", rel);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
