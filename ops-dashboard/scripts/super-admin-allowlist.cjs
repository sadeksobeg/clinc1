require("./load-ops-env.cjs");
const { Client } = require("pg");

async function main() {
  const email = (process.argv[2] || "").toLowerCase().trim();
  const ipCidr = (process.argv[3] || "").trim();
  const note = (process.argv[4] || "manual").trim();
  if (!email || !ipCidr) {
    throw new Error("Usage: node scripts/super-admin-allowlist.cjs <email> <ip_or_cidr> [note]");
  }
  const db = process.env.DATABASE_URL?.trim();
  if (!db) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: db });
  await client.connect();
  try {
    const u = await client.query(`SELECT id FROM staff_users WHERE lower(email)=lower($1) AND role='super_admin' AND deleted_at IS NULL`, [email]);
    const userId = Number(u.rows[0]?.id || 0);
    if (!userId) throw new Error("super_admin_not_found");
    await client.query(
      `INSERT INTO user_ip_allowlist (user_id, ip_cidr, note, is_active)
       VALUES ($1, $2, $3, TRUE)`,
      [userId, ipCidr, note],
    );
    console.log(JSON.stringify({ ok: true, email, ip_cidr: ipCidr }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
