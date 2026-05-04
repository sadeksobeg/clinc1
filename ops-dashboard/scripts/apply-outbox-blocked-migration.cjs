/**
 * Production: add `blocked` to core_outbox.status (HARD DROP policy rows).
 *
 *   cd ops-dashboard
 *   set DATABASE_URL=postgresql://...   (PowerShell: $env:DATABASE_URL="...")
 *   npm run db:apply-outbox-blocked
 *
 * Applies: ../../whatsapp-bridge/sql/migrations/005_core_outbox_blocked_status.sql
 * Safe to run once per environment; re-run is idempotent for constraint/index names used in that file.
 */
const fs = require("fs");
const path = require("path");
require("./load-ops-env.cjs");
const { Client } = require("pg");

const defaultUrl = "postgresql://postgres:postgres@127.0.0.1:5435/clinicsaas";
const databaseUrl = (process.env.DATABASE_URL || defaultUrl).trim();

const migrationPath = path.resolve(
  __dirname,
  "..",
  "..",
  "whatsapp-bridge",
  "sql",
  "migrations",
  "005_core_outbox_blocked_status.sql",
);

async function main() {
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Missing migration file: ${migrationPath}`);
  }
  const sql = fs.readFileSync(migrationPath, "utf8");

  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();
  console.log("Connected:", databaseUrl.replace(/:[^:@/]+@/, ":****@"));
  try {
    const { rows } = await client.query(
      `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'core_outbox' LIMIT 1`,
    );
    if (!rows.length) {
      throw new Error(
        "Table public.core_outbox does not exist. Apply whatsapp-bridge/sql/migrations/004_core_outbox_dialogue.sql first, then re-run this script.",
      );
    }
    console.log("Applying:", path.relative(path.resolve(__dirname, "..", ".."), migrationPath));
    await client.query(sql);
    console.log("OK: core_outbox now allows status = blocked (and idx_core_outbox_drain rebuilt).");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
