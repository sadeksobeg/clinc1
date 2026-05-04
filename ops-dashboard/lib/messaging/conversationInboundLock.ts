import { randomBytes } from "node:crypto";
import { getRedisInboundOpsClient } from "./redisInboundOpsClient";

const LOCK_PREFIX = "lock:conversation:v1";

function lockRedisKey(conversationId: number): string {
  return `${LOCK_PREFIX}:${conversationId}`;
}

function defaultTtlMs(): number {
  const n = Number(process.env.INBOUND_CONVERSATION_LOCK_TTL_MS || 120_000);
  return Number.isFinite(n) && n >= 5_000 && n <= 600_000 ? n : 120_000;
}

/**
 * Serialize post-ingest inbound handling per conversation (after CRM ingest) so dialogue / AI paths do not race.
 * No-op when REDIS_URL is unset (caller runs without distributed lock).
 */
export async function acquireConversationInboundLock(
  conversationId: number,
): Promise<{ acquired: boolean; token: string; release: () => Promise<void> } | { acquired: false }> {
  const client = await getRedisInboundOpsClient();
  if (!client) {
    return {
      acquired: true,
      token: "no-redis",
      release: async () => undefined,
    };
  }
  const key = lockRedisKey(conversationId);
  const token = randomBytes(16).toString("hex");
  const ttl = defaultTtlMs();
  const ok = await client.set(key, token, { NX: true, PX: ttl });
  if (ok !== "OK") {
    return { acquired: false };
  }
  return {
    acquired: true,
    token,
    release: async () => {
      try {
        const cur = await client.get(key);
        if (cur === token) await client.del(key);
      } catch {
        /* ignore */
      }
    },
  };
}
