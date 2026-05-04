require("./load-ops-env.cjs");
const { Client } = require("pg");

async function main() {
  const email = (process.argv[2] || "").toLowerCase().trim();
  const action = (process.argv[3] || "rotate").trim(); // rotate | disable
  const mfaSecret = (process.argv[4] || "").trim();
  if (!email) throw new Error("Usage: node scripts/super-admin-mfa-recovery.cjs <email> <rotate|disable> [new_secret]");
  const db = process.env.DATABASE_URL?.trim();
  if (!db) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: db });
  await client.connect();
  try {
    const u = await client.query(`SELECT id FROM staff_users WHERE lower(email)=lower($1) AND role='super_admin' AND deleted_at IS NULL`, [email]);
    const userId = Number(u.rows[0]?.id || 0);
    if (!userId) throw new Error("super_admin_not_found");

    if (action === "disable") {
      await client.query(`DELETE FROM user_mfa_secrets WHERE user_id=$1`, [userId]);
      await client.query(`UPDATE staff_users SET require_mfa = FALSE WHERE id = $1`, [userId]);
      console.log(JSON.stringify({ ok: true, email, action: "disable" }, null, 2));
      return;
    }
    if (!mfaSecret) throw new Error("new_secret_required_for_rotate");
    await client.query(
      `INSERT INTO user_mfa_secrets (user_id, secret_key, enabled_at, created_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET secret_key=EXCLUDED.secret_key, enabled_at=NOW()`,
      [userId, mfaSecret],
    );
    await client.query(`UPDATE staff_users SET require_mfa = TRUE WHERE id = $1`, [userId]);
    console.log(JSON.stringify({ ok: true, email, action: "rotate" }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
