require("./load-ops-env.cjs");
const { Client } = require("pg");
const url = (process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5435/clinicsaas").trim();
(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  const { rows } = await c.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1",
  );
  console.log(rows.map((r) => r.tablename).join("\n") || "(no tables)");
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
