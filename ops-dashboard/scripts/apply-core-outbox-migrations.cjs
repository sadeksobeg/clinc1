/**
 * Applies core_outbox DDL + blocked status (004 then 005).
 *
 *   cd ops-dashboard
 *   $env:DATABASE_URL = "postgresql://..."
 *   npm run db:apply-core-outbox
 *
 * Prerequisites: `clinics` and base CRM/scheduling schema (e.g. after crm-bootstrap + 003).
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const defaultUrl = "postgresql://postgres:postgres@127.0.0.1:5435/clinicsaas";
const databaseUrl = (process.env.DATABASE_URL || defaultUrl).trim();

const sqlRoot = path.resolve(__dirname, "..", "..", "whatsapp-bridge", "sql", "migrations");
const chain = [
  "004_core_outbox_dialogue.sql",
  "005_core_outbox_blocked_status.sql",
  "006_domain_events.sql",
];

async function main() {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();
  console.log("Connected:", databaseUrl.replace(/:[^:@/]+@/, ":****@"));
  try {
    const { rows } = await client.query(
      `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinics' LIMIT 1`,
    );
    if (!rows.length) {
      throw new Error(
        "Table public.clinics is missing. Run whatsapp-bridge/sql/crm-bootstrap.sql (or migrations/001_multitenant.sql) and scheduling migration 003 first.",
      );
    }
    for (const name of chain) {
      const full = path.join(sqlRoot, name);
      if (!fs.existsSync(full)) {
        throw new Error(`Missing file: ${full}`);
      }
      const sql = fs.readFileSync(full, "utf8");
      console.log("Applying:", `migrations/${name}`);
      await client.query(sql);
      console.log("OK:", name);
    }
    console.log("Done: core_outbox + blocked status ready.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
