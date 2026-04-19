/**
 * List recent domain_events for a conversation (audit / replay planning).
 *   cd ops-dashboard
 *   node scripts/replay-domain-events.cjs --conversation=123 [--limit=50]
 *
 * Does not mutate state; "replay" is inspection-only until a worker consumes events.
 */
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
    const { rows } = await c.query(
      `SELECT id, event_type, payload, correlation_id, occurred_at::text AS occurred_at
       FROM domain_events
       WHERE conversation_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [conv, limit],
    );
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
