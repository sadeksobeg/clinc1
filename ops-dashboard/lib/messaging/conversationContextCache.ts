import { getRedisInboundOpsClient } from "./redisInboundOpsClient";

export type ConvContextSnapshot = {
  dialogue_state: unknown;
  routing: Record<string, unknown>;
};

function cacheKey(clinicId: number, conversationId: number): string {
  return `conv:ctx:${clinicId}:${conversationId}`;
}

function defaultTtlSec(): number {
  const n = Number(process.env.INBOUND_CONV_CTX_CACHE_TTL_SEC || 45);
  return Number.isFinite(n) && n >= 5 && n <= 300 ? Math.floor(n) : 45;
}

export async function getConvContextFromCache(
  clinicId: number,
  conversationId: number,
): Promise<ConvContextSnapshot | null> {
  if ((process.env.INBOUND_CONV_CTX_CACHE || "1").trim() === "0") return null;
  const client = await getRedisInboundOpsClient();
  if (!client) return null;
  try {
    const raw = await client.get(cacheKey(clinicId, conversationId));
    if (!raw) return null;
    const o = JSON.parse(raw) as { dialogue_state?: unknown; routing?: Record<string, unknown> };
    if (!o || typeof o !== "object") return null;
    return {
      dialogue_state: o.dialogue_state ?? null,
      routing: o.routing && typeof o.routing === "object" ? o.routing : {},
    };
  } catch {
    return null;
  }
}

export async function setConvContextCache(
  clinicId: number,
  conversationId: number,
  snapshot: ConvContextSnapshot,
): Promise<void> {
  if ((process.env.INBOUND_CONV_CTX_CACHE || "1").trim() === "0") return;
  const client = await getRedisInboundOpsClient();
  if (!client) return;
  try {
    await client.set(cacheKey(clinicId, conversationId), JSON.stringify(snapshot), { EX: defaultTtlSec() });
  } catch {
    /* ignore */
  }
}

export async function invalidateConvContextCache(clinicId: number, conversationId: number): Promise<void> {
  const client = await getRedisInboundOpsClient();
  if (!client) return;
  try {
    await client.del(cacheKey(clinicId, conversationId));
  } catch {
    /* ignore */
  }
}
