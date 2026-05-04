import { createHash, randomBytes } from "node:crypto";
import { getRedisInboundOpsClient } from "./redisInboundOpsClient";

const LOCK_PREFIX = "lock:inbound:v1";

function lockRedisKey(clinicId: number, from: string): string {
  const chat = createHash("sha256").update(String(from).trim(), "utf8").digest("hex").slice(0, 32);
  return `${LOCK_PREFIX}:clinic:${clinicId}:chat:${chat}`;
}

function defaultTtlMs(): number {
  const n = Number(process.env.INBOUND_PATIENT_LOCK_TTL_MS || 45_000);
  return Number.isFinite(n) && n >= 3_000 && n <= 120_000 ? n : 45_000;
}

/**
 * Serialize inbound handling per WhatsApp identity (clinic + sender) so FSM/AI/dialogue updates do not race.
 * No-op when REDIS_URL unset (caller runs without distributed lock).
 */
export async function acquireInboundPatientLock(
  clinicId: number,
  from: string,
): Promise<{ acquired: boolean; token: string; release: () => Promise<void> } | { acquired: false }> {
  const client = await getRedisInboundOpsClient();
  if (!client) {
    return {
      acquired: true,
      token: "no-redis",
      release: async () => undefined,
    };
  }
  const key = lockRedisKey(clinicId, from);
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
