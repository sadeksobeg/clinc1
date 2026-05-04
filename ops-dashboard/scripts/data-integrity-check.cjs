/**
 * Read-only SQL sanity checks. Requires DATABASE_URL.
 *   node scripts/data-integrity-check.cjs
 */
const { Client } = require("pg");

const url = (process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const checks = [
  {
    id: "appt_confirmed_no_patient",
    sql: `SELECT COUNT(*)::int AS n FROM appointments
          WHERE deleted_at IS NULL AND status = 'confirmed' AND patient_id IS NULL`,
  },
  {
    id: "conversation_orphan_clinic",
    sql: `SELECT COUNT(*)::int AS n FROM conversations c
          WHERE NOT EXISTS (SELECT 1 FROM clinics cl WHERE cl.id = c.clinic_id)`,
  },
  {
    id: "overlap_confirmed_same_doctor",
    sql: `SELECT COUNT(*)::int AS n FROM (
            SELECT a.doctor_id, a.starts_at
            FROM appointments a
            WHERE a.deleted_at IS NULL AND a.status NOT IN ('cancelled', 'no_show')
            GROUP BY a.doctor_id, a.starts_at
            HAVING COUNT(*) > 1
          ) x`,
  },
  {
    id: "p7_outbound_empty_patient",
    sql: `SELECT COUNT(*)::int AS n FROM messages
          WHERE direction = 'outbound'
            AND (text IS NULL OR trim(text) = '')
            AND created_at >= NOW() - interval '7 days'`,
  },
  {
    id: "p7_patient_soft_deleted_but_active_conv",
    sql: `SELECT COUNT(*)::int AS n
          FROM conversations c
          JOIN patients p ON p.id = c.patient_id AND p.clinic_id = c.clinic_id
          WHERE c.deleted_at IS NULL AND p.deleted_at IS NOT NULL`,
  },
];

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  const results = [];
  try {
    for (const q of checks) {
      const r = await c.query(q.sql);
      results.push({ id: q.id, count: r.rows[0]?.n ?? null });
    }
  } finally {
    await c.end();
  }
  const bad = results.filter((x) => Number(x.count) > 0);
  console.log(JSON.stringify({ ok: bad.length === 0, results, failing: bad }, null, 2));
  if (bad.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
