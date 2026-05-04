import { getRedisInboundOpsClient } from "./redisInboundOpsClient";

function rateLimitEnabled(): boolean {
  return (process.env.INBOUND_AI_CONV_RATE_LIMIT || "").trim() === "1";
}

function tokenBucketEnabled(): boolean {
  return (process.env.INBOUND_AI_TOKEN_BUCKET || "").trim() === "1";
}

function windowMs(): number {
  const n = Number(process.env.INBOUND_AI_PER_CONV_MIN_INTERVAL_MS || 2000);
  return Number.isFinite(n) && n >= 200 && n <= 120_000 ? Math.floor(n) : 2000;
}

function bucketCapacity(): number {
  const n = Number(process.env.INBOUND_AI_BUCKET_CAPACITY || 2);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? Math.floor(n) : 2;
}

function bucketRefillPerWindow(): number {
  const n = Number(process.env.INBOUND_AI_BUCKET_REFILL_PER_WINDOW || 1);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? Math.floor(n) : 1;
}

function nxBudgetKey(conversationId: number): string {
  return `conv:ai_budget:${conversationId}`;
}

function tokenBucketKey(conversationId: number): string {
  return `conv:ai_tb:${conversationId}`;
}

export type AiTokenBucketState = { tokens: number; last_ms: number };

/** Pure refill step (for tests + Redis path). */
export function refillTokenBucketState(
  state: AiTokenBucketState,
  now: number,
  cap: number,
  refillPerWindow: number,
  windowMsVal: number,
): AiTokenBucketState {
  let { tokens, last_ms } = state;
  const elapsed = Math.max(0, now - last_ms);
  const ticks = Math.floor(elapsed / windowMsVal);
  if (ticks > 0) {
    tokens = Math.min(cap, tokens + ticks * refillPerWindow);
    last_ms = last_ms + ticks * windowMsVal;
  }
  return { tokens, last_ms };
}

export function consumeOneTokenIfAvailable(state: AiTokenBucketState): { next: AiTokenBucketState; ok: boolean } {
  if (state.tokens >= 1) {
    return { next: { ...state, tokens: state.tokens - 1 }, ok: true };
  }
  return { next: state, ok: false };
}

async function tryAcquireNxSlot(conversationId: number): Promise<boolean> {
  const client = await getRedisInboundOpsClient();
  if (!client) return true;
  const key = nxBudgetKey(conversationId);
  const ttl = windowMs();
  try {
    const r = await client.set(key, "1", { NX: true, PX: ttl });
    return r === "OK";
  } catch {
    return true;
  }
}

async function tryConsumeTokenBucket(conversationId: number): Promise<boolean> {
  const client = await getRedisInboundOpsClient();
  if (!client) return true;
  const key = tokenBucketKey(conversationId);
  const cap = bucketCapacity();
  const refill = bucketRefillPerWindow();
  const window = windowMs();
  const now = Date.now();
  const ttlSec = Math.max(60, Math.ceil((window * cap) / 1000) + 120);
  try {
    const raw = await client.get(key);
    let st: AiTokenBucketState =
      raw != null && raw !== ""
        ? (JSON.parse(String(raw)) as AiTokenBucketState)
        : { tokens: cap, last_ms: now };
    if (!Number.isFinite(st.tokens) || !Number.isFinite(st.last_ms)) {
      st = { tokens: cap, last_ms: now };
    }
    st = refillTokenBucketState(st, now, cap, refill, window);
    const { next, ok } = consumeOneTokenIfAvailable(st);
    await client.set(key, JSON.stringify(next), { EX: ttlSec });
    return ok;
  } catch {
    return true;
  }
}

/**
 * Returns true if this worker may invoke Ollama for this conversation.
 * NX mode (default when INBOUND_AI_TOKEN_BUCKET off): at most one slot per window.
 * Token bucket (INBOUND_AI_TOKEN_BUCKET=1): burst up to capacity, refill per window.
 */
export async function tryAcquireAiBudgetSlot(conversationId: number): Promise<boolean> {
  if (!rateLimitEnabled()) return true;
  if (tokenBucketEnabled()) {
    return tryConsumeTokenBucket(conversationId);
  }
  return tryAcquireNxSlot(conversationId);
}
