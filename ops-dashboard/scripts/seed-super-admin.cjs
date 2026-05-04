require("./load-ops-env.cjs");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

async function main() {
  const email = (process.argv[2] || "superadmin@local.test").toLowerCase();
  const password = process.argv[3] || "SuperAdmin12345!";
  const mfaSecret = (process.argv[4] || "").trim();
  const db = process.env.DATABASE_URL?.trim();
  if (!db) throw new Error("DATABASE_URL is required");
  if (!mfaSecret) throw new Error("mfa_secret_base32 is required as 3rd argument");

  const client = new Client({ connectionString: db });
  await client.connect();
  try {
    const hash = bcrypt.hashSync(password, 10);
    const up = await client.query(
      `INSERT INTO staff_users (clinic_id, email, display_name, role, password_hash, is_active, require_mfa, security_flags)
       VALUES (1, $1, 'Platform Super Admin', 'super_admin', $2, TRUE, TRUE, '{"platform_scope":true}'::jsonb)
       ON CONFLICT (clinic_id, email)
       DO UPDATE SET role='super_admin', password_hash=EXCLUDED.password_hash, is_active=TRUE, require_mfa=TRUE,
                     security_flags = COALESCE(staff_users.security_flags, '{}'::jsonb) || '{"platform_scope":true}'::jsonb,
                     deleted_at = NULL
       RETURNING id`,
      [email, hash],
    );
    const userId = Number(up.rows[0]?.id || 0);
    if (!userId) throw new Error("failed_upsert_super_admin");
    await client.query(
      `INSERT INTO user_mfa_secrets (user_id, secret_key, enabled_at, created_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET secret_key = EXCLUDED.secret_key, enabled_at = NOW()`,
      [userId, mfaSecret],
    );
    console.log(JSON.stringify({ ok: true, user_id: userId, email, password, role: "super_admin" }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
