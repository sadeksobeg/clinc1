/**
 * Reads Redis Stream from REDIS_URL (default ops:events:inbound) and logs entries.
 *   npm run worker:event-consumer-stub
 */
const { createClient } = require("redis");

const url = (process.env.REDIS_URL || "").trim();
const stream = (process.env.REDIS_EVENTS_STREAM || "ops:events:inbound").trim();

async function main() {
  if (!url) {
    console.error("Set REDIS_URL (e.g. redis://127.0.0.1:6379)");
    process.exit(1);
  }
  const client = createClient({ url });
  client.on("error", (e) => console.error("[consumer]", e.message));
  await client.connect();
  console.log("Listening:", stream, "←", url.replace(/:[^:@/]+@/, ":****@"));
  let lastId = "0-0";
  for (;;) {
    const batch = await client.xRead([{ key: stream, id: lastId }], { COUNT: 10, BLOCK: 10000 });
    if (!batch || !batch.length) continue;
    for (const s of batch) {
      for (const msg of s.messages) {
        lastId = msg.id;
        const payload = msg.message?.payload || JSON.stringify(msg.message);
        console.log(JSON.stringify({ id: msg.id, payload }));
      }
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
