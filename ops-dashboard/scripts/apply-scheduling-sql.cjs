/**
 * Applies clinic scheduling SQL on Postgres.
 *
 *   cd ops-dashboard
 *   node scripts/apply-scheduling-sql.cjs
 *
 * Env:
 *   DATABASE_URL â€” default postgresql://postgres:postgres@127.0.0.1:5435/clinicsaas
 *   Loads ops-dashboard/.env and .env.local when variables are unset (same idea as Next).
 *   APPLY_CRM_BOOTSTRAP=true â€” prepend sql/crm-bootstrap.sql (use only on empty / disposable DB)
 *
 * Also applies migrations/004_core_outbox_dialogue.sql and 005_core_outbox_blocked_status.sql
 * after seeds (idempotent where supported).
 */
const fs = require("fs");
const path = require("path");
require("./load-ops-env.cjs");
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
  "migrations/037_platform_incidents.sql",
  "migrations/038_platform_system_state.sql",
  "migrations/039_platform_decisions_actions.sql",
  "migrations/040_platform_state_intelligence.sql",
  "migrations/041_platform_decision_rules.sql",
  "migrations/042_platform_action_results.sql",
  "migrations/043_platform_incident_playbooks.sql",
  "migrations/044_platform_outcome_history.sql",
];

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return rows.length > 0;
}

async function main() {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();
  console.log("Connected:", databaseUrl.replace(/:[^:@/]+@/, ":****@"));
  const useBootstrap =
    String(process.env.APPLY_CRM_BOOTSTRAP || "").toLowerCase() === "true";
  if (!useBootstrap && !(await tableExists(client, "staff_users"))) {
    console.error(
      [
        'Missing table "public.staff_users". Migration 003_clinic_scheduling.sql expects the WhatsApp CRM schema.',
        "",
        "Fix one of:",
        "  â€¢ Disposable / empty DB:  set APPLY_CRM_BOOTSTRAP=true (prepends sql/crm-bootstrap.sql) then re-run.",
        "  â€¢ Dedicated ops CRM DB:    npm run db:provision-local-ops   then point DATABASE_URL at â€¦/clinic_ops (or your OPS_CRM_DATABASE).",
        "",
        "Do not run APPLY_CRM_BOOTSTRAP=true against a production clinicsaas database that already has unrelated tables.",
      ].join("\n")
    );
    process.exitCode = 1;
    await client.end();
    return;
  }
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

