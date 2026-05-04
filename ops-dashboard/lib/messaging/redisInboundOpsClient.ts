/**
 * Shared Redis client for inbound lock + deferred queue (separate from events stream client).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;

export async function getRedisInboundOpsClient(): Promise<any | null> {
  const url = (process.env.REDIS_URL || "").trim();
  if (!url) return null;
  if (redisClient) return redisClient;
  try {
    const { createClient } = await import("redis");
    const c = createClient({ url });
    c.on("error", () => undefined);
    await c.connect();
    redisClient = c;
    return c;
  } catch {
    return null;
  }
}
