/**
 * Creates a dedicated Postgres database for the WhatsApp CRM / ops-dashboard schema
 * (clinics, core_outbox, â€¦) when your existing DATABASE_URL database is something else
 * (e.g. .NET `clinicsaas` on the same server).
 *
 *   cd ops-dashboard
 *   node scripts/provision-ops-crm-database.cjs
 *
 * Env:
 *   POSTGRES_ADMIN_URL â€” connection to maintenance DB `postgres` (default â€¦/postgres)
 *   OPS_CRM_DATABASE   â€” database to create + seed (default clinic_ops)
 */
require("./load-ops-env.cjs");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const defaultAdmin =
  process.env.POSTGRES_ADMIN_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5435/postgres";
const targetDb = (process.env.OPS_CRM_DATABASE || "clinic_ops").trim();

const sqlRoot = path.resolve(__dirname, "..", "..", "whatsapp-bridge", "sql");
const files = [
  "crm-bootstrap.sql",
  "migrations/003_clinic_scheduling.sql",
  "seed-scheduling-demo.sql",
  "seed-real-world-validation.sql",
  "migrations/004_core_outbox_dialogue.sql",
  "migrations/005_core_outbox_blocked_status.sql",
  "migrations/006_domain_events.sql",
  "migrations/007_processed_events.sql",
  "migrations/008_dead_letter_events.sql",
  "migrations/009_clinic_saas_tenant_links.sql",
  "migrations/010_clinic_public_hours.sql",
  "migrations/011_patients_profile_columns.sql",
  "migrations/012_ai_interaction_logs.sql",
  "migrations/013_manual_billing_local.sql",
  "migrations/016_password_reset_tokens.sql",
  "migrations/017_trial_funnel_events.sql",
  "migrations/018_billing_reminder_runs.sql",
  "migrations/019_trial_expiring_status.sql",
  "migrations/020_billing_payment_integrity.sql",
  "migrations/021_billing_invoices_receipts.sql",
  "migrations/022_trial_funnel_attribution.sql",
  "migrations/023_user_sessions.sql",
  "migrations/024_support_system.sql",
  "migrations/025_notifications.sql",
  "migrations/026_billing_lifecycle_states.sql",
  "migrations/027_trial_identity_fingerprints.sql",
  "migrations/028_observability_core.sql",
  "migrations/029_job_system.sql",
  "migrations/030_analytics_rollups.sql",
  "migrations/031_support_v2_scale.sql",
  "migrations/032_simulation_runs.sql",
  "migrations/033_system_runtime_flags.sql",
  "migrations/034_emergency_incident_snapshots.sql",
  "migrations/035_p7_conversation_row_version.sql",
  "migrations/036_super_admin_security.sql",
];

async function ensureDatabase(adminUrl, dbName) {
  const admin = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 15_000 });
  await admin.connect();
  try {
    const safeId = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName) ? dbName : null;
    if (!safeId) {
      throw new Error(`Invalid OPS_CRM_DATABASE identifier: ${dbName}`);
    }
    const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (!rows.length) {
      console.log("Creating database:", dbName);
      await admin.query(`CREATE DATABASE ${safeId}`);
      console.log("OK: database created.");
    } else {
      console.log("Database already exists:", dbName);
    }
  } finally {
    await admin.end();
  }
}

function buildUrlForDatabase(adminUrl, dbName) {
  const base = adminUrl.trim().replace(/\/$/, "");
  const withoutDb = base.replace(/\/[^/]+$/, "");
  return `${withoutDb}/${dbName}`;
}

async function main() {
  const adminUrl = defaultAdmin.trim();
  console.log("Admin URL:", adminUrl.replace(/:[^:@/]+@/, ":****@"));
  await ensureDatabase(adminUrl, targetDb);

  const databaseUrl = buildUrlForDatabase(adminUrl, targetDb);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();
  console.log("Applying CRM + scheduling + outbox to:", targetDb);
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

  console.log("");
  console.log("Done. Set in ops-dashboard .env.local:");
  console.log(`  DATABASE_URL=${databaseUrl.replace(/:[^:@/]+@/, ":****@")}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

