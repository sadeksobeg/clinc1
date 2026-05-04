/**
 * List recent domain_events for a conversation (audit / replay planning).
 *   cd ops-dashboard
 *   node scripts/replay-domain-events.cjs --conversation=123 [--limit=50]
 *
 * Does not mutate state; "replay" is inspection-only until a worker consumes events.
 */
require("./load-ops-env.cjs");
const { Client } = require("pg");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a, true];
  }),
);

async function main() {
  const conv = Number(args.conversation);
  if (!Number.isFinite(conv)) {
    console.error("Usage: node scripts/replay-domain-events.cjs --conversation=<id> [--limit=50]");
    process.exit(1);
  }
  const limit = Math.min(500, Math.max(1, Number(args.limit) || 50));
  const url =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5435/clinic_ops";
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    let rows;
    try {
      const r = await c.query(
        `SELECT id, event_type, payload, correlation_id, occurred_at::text AS occurred_at
         FROM domain_events
         WHERE conversation_id = $1
         ORDER BY id DESC
         LIMIT $2`,
        [conv, limit],
      );
      rows = r.rows;
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? e.code : "";
      const msg = e instanceof Error ? e.message : String(e);
      const missing =
        code === "42P01" ||
        /relation\s+"domain_events"\s+does not exist/i.test(msg) ||
        (/does not exist/i.test(msg) && /domain_events/i.test(msg));
      if (missing) {
        console.log(
          JSON.stringify(
            {
              skipped: true,
              reason: "domain_events table missing",
              hint: "Apply migration 006_domain_events.sql (e.g. npm run db:apply-scheduling if your pipeline includes it).",
              conversation_id: conv,
            },
            null,
            2,
          ),
        );
        return;
      }
      throw e;
    }
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
