/**
 * Upserts a non-admin staff user for local demos (clinic_id=1).
 *   cd ops-dashboard && node scripts/seed-demo-staff-viewer.cjs
 */
require("./load-ops-env.cjs");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

const email = process.argv[2] || "staff@local.test";
const password = process.argv[3] || "Staff12345!";
const clinicId = Number(process.argv[4] || 1);

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required");
  const hash = bcrypt.hashSync(password, 10);
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query(
    `INSERT INTO staff_users (clinic_id, email, display_name, role, password_hash, is_active)
     VALUES ($1, $2, 'Demo Staff', 'viewer', $3, TRUE)
     ON CONFLICT (clinic_id, email)
     DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'viewer', is_active = TRUE, deleted_at = NULL`,
    [clinicId, email.toLowerCase(), hash],
  );
  await c.end();
  console.log(JSON.stringify({ ok: true, email: email.toLowerCase(), password, role: "viewer", clinic_id: clinicId }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
