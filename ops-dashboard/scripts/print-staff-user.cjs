/**
 * تشخيص سريع: هل البريد موجود في نفس قاعدة البيانات التي يقرأها ops-dashboard؟
 * الاستخدام: node scripts/print-staff-user.cjs you@example.com
 */
require("./load-ops-env.cjs");
const { Client } = require("pg");

async function main() {
  const email = (process.argv[2] || "").trim();
  if (!email) {
    console.error("Usage: node scripts/print-staff-user.cjs <email>");
    process.exit(1);
  }
  const db = process.env.DATABASE_URL?.trim();
  if (!db) {
    console.error("DATABASE_URL missing in ops-dashboard .env / .env.local");
    process.exit(1);
  }
  console.error("[print-staff-user] DB:", db.replace(/:[^:@/]+@/, ":****@"));

  const client = new Client({ connectionString: db });
  await client.connect();
  try {
    const r = await client.query(
      `SELECT id, clinic_id, email, role, is_active, deleted_at IS NOT NULL AS is_deleted,
              password_hash IS NOT NULL AND length(password_hash) > 0 AS has_password
       FROM staff_users
       WHERE lower(email) = lower($1)
       ORDER BY updated_at DESC NULLS LAST, id DESC`,
      [email],
    );
    if (!r.rows.length) {
      console.log(JSON.stringify({ found: false, email }, null, 2));
      return;
    }
    console.log(
      JSON.stringify(
        {
          found: true,
          count: r.rows.length,
          rows: r.rows.map((row) => ({
            id: String(row.id),
            clinic_id: Number(row.clinic_id),
            email: row.email,
            role: row.role,
            is_active: row.is_active,
            is_deleted: row.is_deleted,
            has_password: row.has_password,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
