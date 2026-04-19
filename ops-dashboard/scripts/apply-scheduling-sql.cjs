/**
 * Applies clinic scheduling SQL on Postgres.
 *
 *   cd ops-dashboard
 *   node scripts/apply-scheduling-sql.cjs
 *
 * Env:
 *   DATABASE_URL — default postgresql://postgres:postgres@127.0.0.1:5435/clinicsaas
 *   APPLY_CRM_BOOTSTRAP=true — prepend sql/crm-bootstrap.sql (use only on empty / disposable DB)
 *
 * Also applies migrations/004_core_outbox_dialogue.sql and 005_core_outbox_blocked_status.sql
 * after seeds (idempotent where supported).
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const defaultUrl = "postgresql://postgres:postgres@127.0.0.1:5435/clinicsaas";
const databaseUrl = (process.env.DATABASE_URL || defaultUrl).trim();

const sqlRoot = path.resolve(__dirname, "..", "..", "whatsapp-bridge", "sql");
const files = [
  ...(String(process.env.APPLY_CRM_BOOTSTRAP || "").toLowerCase() === "true" ? ["crm-bootstrap.sql"] : []),
  "migrations/003_clinic_scheduling.sql",
  "seed-scheduling-demo.sql",
  "seed-real-world-validation.sql",
  "migrations/004_core_outbox_dialogue.sql",
  "migrations/005_core_outbox_blocked_status.sql",
  "migrations/006_domain_events.sql",
];

async function main() {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();
  console.log("Connected:", databaseUrl.replace(/:[^:@/]+@/, ":****@"));
  try {
    for (const rel of files) {
      const full = path.join(sqlRoot, rel);
      if (!fs.existsSync(full)) {
        throw new Error(`Missing file: ${full}`);
      }
      const sql = fs.readFileSync(full, "utf8");
      console.log("Applying:", rel);
      await client.query(sql);
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
