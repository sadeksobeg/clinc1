require("./load-ops-env.cjs");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

async function main() {
  const email = process.argv[2] || "ops@local.test";
  const password = process.argv[3] || "Admin12345!";
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error(
      "DATABASE_URL غير مضبوط. أضفه في ops-dashboard/.env.local (نفس قيمة تشغيل npm run dev) ثم أعد المحاولة.",
    );
    process.exit(1);
  }
  console.error("[reset-password] DB:", connectionString.replace(/:[^:@/]+@/, ":****@"));

  const hash = bcrypt.hashSync(password, 10);
  const client = new Client({ connectionString });
  await client.connect();
  const result = await client.query(
    "UPDATE staff_users SET password_hash = $1, is_active = true WHERE lower(email) = lower($2) AND deleted_at IS NULL RETURNING clinic_id, email",
    [hash, email],
  );
  await client.end();

  if (!result.rowCount) {
    console.error(`No matching active user found for email=${email}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        clinics: result.rows.map((r) => Number(r.clinic_id)),
        email: result.rows[0].email,
        password,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
