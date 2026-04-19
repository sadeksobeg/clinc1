import type { InboundMessageRecorded } from "./inboundMessageRecorded";

const STREAM_KEY = process.env.REDIS_EVENTS_STREAM || "ops:events:inbound";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;

async function getClient() {
  const url = (process.env.REDIS_URL || "").trim();
  if (!url) return null;
  if (redisClient) return redisClient;
  try {
    const { createClient } = await import("redis");
    const c = createClient({ url });
    c.on("error", (err: Error) => {
      console.error("[redis_events]", err.message);
    });
    await c.connect();
    redisClient = c;
    return c;
  } catch {
    return null;
  }
}

/**
 * XADD to Redis Streams. No-op if REDIS_URL unset or redis client fails.
 */
export async function publishInboundMessageRecorded(event: InboundMessageRecorded): Promise<void> {
  const c = await getClient();
  if (!c) return;
  try {
    const payload = JSON.stringify(event);
    await c.xAdd(STREAM_KEY, "*", { payload });
  } catch (e) {
    console.error("[redis_events] xadd_failed", e instanceof Error ? e.message : e);
  }
}
