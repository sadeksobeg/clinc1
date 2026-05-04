import type { Pool } from "pg";
import { getRedisInboundOpsClient } from "./redisInboundOpsClient";
import { loadCurrentDialogueVersion } from "./deferredPostIngestStale";
import {
  type InboundQueuePriority,
  type PostIngestJobV2,
  type PostIngestLane,
  parsePostIngestJobV2,
  priorityRank,
  serializePostIngestJobV2,
} from "./inboundDeferredJobV2";
import {
  fairConversationIdOrder,
  parseFairPatternFromEnv,
  rotateOrder,
} from "./inboundFairScheduler";

const PRE_INGEST_QUEUE_KEY = "inbound:deferred";

/** Per-conversation FIFO (Option A in plan). Legacy list when `lane` is omitted on jobs. */
export function convInboundQueueKey(conversationId: number): string {
  return `queue:inbound:conv:${conversationId}`;
}

/** v4 fast / slow lanes (FIFO each). */
export function convPostIngestLaneQueueKey(conversationId: number, lane: PostIngestLane): string {
  return `queue:inbound:conv:${conversationId}:${lane}`;
}

export type PostIngestClaimLane = PostIngestLane | "legacy";

export function convQueueKeyForClaimLane(conversationId: number, lane: PostIngestClaimLane): string {
  if (lane === "legacy") return convInboundQueueKey(conversationId);
  return convPostIngestLaneQueueKey(conversationId, lane);
}

/** Target Redis list for enqueue / requeue based on job.lane. */
export function convQueueKeyForPostIngestJob(job: Pick<PostIngestJobV2, "conversation_id" | "lane">): string {
  return job.lane !== undefined ? convPostIngestLaneQueueKey(job.conversation_id, job.lane) : convInboundQueueKey(job.conversation_id);
}

async function totalConvQueueDepth(
  client: NonNullable<Awaited<ReturnType<typeof getRedisInboundOpsClient>>>,
  conversationId: number,
): Promise<number> {
  const fast = await client.lLen(convPostIngestLaneQueueKey(conversationId, "fast"));
  const slow = await client.lLen(convPostIngestLaneQueueKey(conversationId, "slow"));
  const leg = await client.lLen(convInboundQueueKey(conversationId));
  return fast + slow + leg;
}

const CONV_PENDING_SET = "inbound:conv:pending";
const CONV_HEAD_PRIO_HASH = "inbound:conv:head_prio";
const DLQ_LIST = "inbound:dead";
const FAIR_CURSOR_KEY = "inbound:fair:cursor";

export function defaultProcessingShardCount(): number {
  const n = Number(process.env.INBOUND_PROCESSING_SHARDS || 8);
  return Number.isFinite(n) && n >= 1 && n <= 64 ? Math.floor(n) : 8;
}

export function processingShardForConversation(conversationId: number, shardCount?: number): number {
  const s = shardCount ?? defaultProcessingShardCount();
  const mod = s >= 1 ? s : 1;
  const x = conversationId >= 0 ? conversationId : -conversationId;
  return x % mod;
}

export function processingListKey(shard: number): string {
  return `inbound:processing:${shard}`;
}

/** Optional: pin this worker to shard ids in [start, end] inclusive (horizontal scale). */
export function workerOwnedShardRange(): { start: number; end: number } | null {
  const a = process.env.INBOUND_WORKER_SHARD_START;
  const b = process.env.INBOUND_WORKER_SHARD_END;
  if (a === undefined && b === undefined) return null;
  const start = Math.max(0, Math.floor(Number(a ?? 0)));
  const end = Math.max(start, Math.floor(Number(b ?? start)));
  return { start, end };
}

export function shardAllowedForWorker(shard: number, range: { start: number; end: number } | null): boolean {
  if (!range) return true;
  return shard >= range.start && shard <= range.end;
}

export type DeferredInboundJobV1 = {
  v: 1;
  enqueued_at: string;
  /** Same shape as process-inbound JSON body; full `processInboundMessage` replay (pre-CRM sender lock only). */
  payload: Record<string, unknown>;
};

export async function pushDeferredInboundJob(payload: Record<string, unknown>): Promise<boolean> {
  const client = await getRedisInboundOpsClient();
  if (!client) return false;
  const job: DeferredInboundJobV1 = {
    v: 1,
    enqueued_at: new Date().toISOString(),
    payload,
  };
  await client.rPush(PRE_INGEST_QUEUE_KEY, JSON.stringify(job));
  return true;
}

/** Blocking pop for pre-ingest jobs (seconds timeout). */
export async function blockingPopDeferredInboundJob(timeoutSec: number): Promise<DeferredInboundJobV1 | null> {
  const client = await getRedisInboundOpsClient();
  if (!client) return null;
  const sec = String(Math.max(1, Math.min(600, timeoutSec)));
  const raw = await client.sendCommand(["BRPOP", PRE_INGEST_QUEUE_KEY, sec]);
  if (!raw || !Array.isArray(raw) || raw.length < 2) return null;
  const element = String(raw[1]);
  try {
    const job = JSON.parse(element) as DeferredInboundJobV1;
    if (job?.v !== 1 || !job.payload || typeof job.payload !== "object") return null;
    return job;
  } catch {
    return null;
  }
}

export function createPostIngestJobV2(
  args: Omit<PostIngestJobV2, "v" | "skip_ingest" | "retry_count" | "first_enqueued_at" | "enqueued_at" | "claimed_at" | "lease_until">,
): PostIngestJobV2 {
  const now = new Date().toISOString();
  return {
    v: 2,
    skip_ingest: true,
    ...args,
    retry_count: 0,
    first_enqueued_at: now,
    enqueued_at: now,
  };
}

async function updateConvHeadPriority(
  client: Awaited<ReturnType<typeof getRedisInboundOpsClient>>,
  conversationId: number,
  priority: InboundQueuePriority,
): Promise<void> {
  if (!client) return;
  const p = priorityRank(priority);
  const field = String(conversationId);
  const cur = await client.hGet(CONV_HEAD_PRIO_HASH, field);
  const curN = cur != null && cur !== "" ? Number(cur) : NaN;
  if (!Number.isFinite(curN) || p < curN) {
    await client.hSet(CONV_HEAD_PRIO_HASH, field, String(p));
  }
}

/** Enqueue post-CRM work (skip ingest). FIFO per conversation + pending set for worker discovery. */
export async function enqueuePostIngestDeferredV2Job(job: PostIngestJobV2): Promise<boolean> {
  const client = await getRedisInboundOpsClient();
  if (!client) return false;
  const cid = job.conversation_id;
  const line = serializePostIngestJobV2({ ...job, claimed_at: undefined, lease_until: undefined });
  await client.rPush(convQueueKeyForPostIngestJob(job), line);
  await client.sAdd(CONV_PENDING_SET, String(cid));
  await updateConvHeadPriority(client, cid, job.priority);
  return true;
}

export function defaultStaleRequeueMax(): number {
  const n = Number(process.env.INBOUND_STALE_REQUEUE_MAX || 5);
  return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.floor(n) : 5;
}

/**
 * After dialogue_version stale detection: re-enqueue same payload on slow lane with fresh snapshot
 * so no inbound signal is dropped (bounded by stale_requeue_count / INBOUND_STALE_REQUEUE_MAX).
 */
export async function softRequeueStalePostIngestJob(pool: Pool, job: PostIngestJobV2): Promise<boolean> {
  const cur = await loadCurrentDialogueVersion(pool, job.conversation_id);
  const next: PostIngestJobV2 = {
    ...job,
    lane: "slow",
    priority: "low",
    claimed_at: undefined,
    lease_until: undefined,
    dialogue_version_snapshot: cur,
    stale_requeue_count: (job.stale_requeue_count ?? 0) + 1,
    enqueued_at: new Date().toISOString(),
  };
  return enqueuePostIngestDeferredV2Job(next);
}

async function cleanupConvIfEmpty(
  client: NonNullable<Awaited<ReturnType<typeof getRedisInboundOpsClient>>>,
  conversationId: number,
): Promise<void> {
  const len = await totalConvQueueDepth(client, conversationId);
  if (len === 0) {
    await client.sRem(CONV_PENDING_SET, String(conversationId));
    await client.hDel(CONV_HEAD_PRIO_HASH, String(conversationId));
  }
}

/** Peek up to `tailCount` raw JSON lines at the head of a lane list (after the current head was BLMOVE'd). */
export async function peekPostIngestTailJobLines(
  conversationId: number,
  lane: PostIngestClaimLane,
  tailCount: number,
): Promise<string[]> {
  const client = await getRedisInboundOpsClient();
  if (!client || tailCount <= 0) return [];
  const key = convQueueKeyForClaimLane(conversationId, lane);
  const depth = await client.lLen(key);
  if (depth === 0) return [];
  const n = Math.min(tailCount, depth);
  const rows = await client.lRange(key, 0, n - 1);
  return rows.map(String);
}

/** Remove the first `removeFromHead` elements from a per-conversation lane list (after successful merged process). */
export async function trimPostIngestConvLaneLeft(
  conversationId: number,
  lane: PostIngestClaimLane,
  removeFromHead: number,
): Promise<void> {
  const client = await getRedisInboundOpsClient();
  if (!client || removeFromHead <= 0) return;
  const key = convQueueKeyForClaimLane(conversationId, lane);
  const depth = await client.lLen(key);
  if (depth === 0) return;
  const n = Math.min(removeFromHead, depth);
  await client.lTrim(key, n, -1);
  await cleanupConvIfEmpty(client, conversationId);
}

/** Replace the leased payload at the head of the processing shard list if it still matches `expectedLeasedStr`. */
export async function replacePostIngestProcessingHeadIfUnchanged(
  conversationId: number,
  expectedLeasedStr: string,
  nextLeasedStr: string,
): Promise<boolean> {
  const client = await getRedisInboundOpsClient();
  if (!client) return false;
  const shard = processingShardForConversation(conversationId);
  const procKey = processingListKey(shard);
  const head = await client.lRange(procKey, 0, 0);
  if (!head[0] || String(head[0]) !== expectedLeasedStr) return false;
  await client.lSet(procKey, 0, nextLeasedStr);
  return true;
}

async function processingHeadHasLiveLease(
  client: NonNullable<Awaited<ReturnType<typeof getRedisInboundOpsClient>>>,
  procKey: string,
): Promise<boolean> {
  const depth = await client.lLen(procKey);
  if (depth === 0) return false;
  const head = await client.lRange(procKey, 0, 0);
  const line = head[0];
  if (!line) return false;
  try {
    const p = parsePostIngestJobV2(JSON.parse(line));
    if (p?.lease_until && p.lease_until > Date.now()) return true;
  } catch {
    return false;
  }
  return false;
}

export type ClaimedPostIngestLease = {
  leasedStr: string;
  lane: PostIngestClaimLane;
};

const LANE_CLAIM_ORDER: PostIngestClaimLane[] = ["fast", "slow", "legacy"];

async function finalizeClaimedPostIngest(
  client: NonNullable<Awaited<ReturnType<typeof getRedisInboundOpsClient>>>,
  args: {
    moved: string;
    cid: number;
    lane: PostIngestClaimLane;
    procKey: string;
    leaseMs: number;
    cursor: number;
  },
): Promise<ClaimedPostIngestLease | null> {
  const { moved, cid, lane, procKey, leaseMs, cursor } = args;
  let job: PostIngestJobV2 | null = null;
  try {
    job = parsePostIngestJobV2(JSON.parse(String(moved)));
  } catch {
    await client.lRem(procKey, 1, String(moved));
    await cleanupConvIfEmpty(client, cid);
    return null;
  }
  if (!job) {
    await client.lRem(procKey, 1, String(moved));
    await cleanupConvIfEmpty(client, cid);
    return null;
  }
  const now = Date.now();
  const leased: PostIngestJobV2 = {
    ...job,
    claimed_at: now,
    lease_until: now + leaseMs,
  };
  const leasedStr = serializePostIngestJobV2(leased);
  await client.lSet(procKey, 0, leasedStr);
  await cleanupConvIfEmpty(client, cid);
  await client.set(FAIR_CURSOR_KEY, String((cursor + 1) % 1_000_003));
  return { leasedStr, lane };
}

/**
 * Claim next post-ingest job: weighted-fair conversation order, fast lane before slow before legacy,
 * BLMOVE / LMOVE to per-shard processing list.
 * Recommended: one worker process, or pin workers with INBOUND_WORKER_SHARD_* so each shard list has at most one live lease holder.
 */
export async function claimNextPostIngestJob(
  leaseMs: number,
  brPopTimeoutSec: number,
): Promise<ClaimedPostIngestLease | null> {
  const client = await getRedisInboundOpsClient();
  if (!client) return null;
  await requeueStaleInboundProcessing();
  const shardCount = defaultProcessingShardCount();
  const shardRange = workerOwnedShardRange();
  const pattern = parseFairPatternFromEnv();

  const members = await client.sMembers(CONV_PENDING_SET);
  if (!members.length) return null;
  const entries = await Promise.all(
    members.map(async (id: string) => {
      const prioRaw = await client.hGet(CONV_HEAD_PRIO_HASH, id);
      const prio = Number(prioRaw || "2");
      return { id, prio: Number.isFinite(prio) ? prio : 2 };
    }),
  );

  const fairBase = fairConversationIdOrder(entries, pattern);
  const cursorRaw = await client.get(FAIR_CURSOR_KEY);
  const cursor = Number(cursorRaw || "0") || 0;
  const fairOrder = rotateOrder(fairBase, cursor);

  const timeout = Math.max(1, Math.min(60, brPopTimeoutSec));

  for (const id of fairOrder) {
    const cid = Number(id);
    const shard = processingShardForConversation(cid, shardCount);
    if (!shardAllowedForWorker(shard, shardRange)) continue;

    const procKey = processingListKey(shard);
    if (await processingHeadHasLiveLease(client, procKey)) continue;

    for (const lane of LANE_CLAIM_ORDER) {
      const convKey = convQueueKeyForClaimLane(cid, lane);
      const movedRaw = await client.sendCommand(["LMOVE", convKey, procKey, "LEFT", "LEFT"]);
      const moved = movedRaw ? String(movedRaw) : null;
      if (!moved) continue;
      const fin = await finalizeClaimedPostIngest(client, { moved, cid, lane, procKey, leaseMs, cursor });
      if (fin) return fin;
    }
  }

  for (const id of fairOrder) {
    const cid = Number(id);
    const shard = processingShardForConversation(cid, shardCount);
    if (!shardAllowedForWorker(shard, shardRange)) continue;

    const procKey = processingListKey(shard);
    if (await processingHeadHasLiveLease(client, procKey)) continue;

    for (const lane of LANE_CLAIM_ORDER) {
      const convKey = convQueueKeyForClaimLane(cid, lane);
      const len = await client.lLen(convKey);
      if (len === 0) continue;
      const movedRaw = await client.sendCommand(["BLMOVE", convKey, procKey, "LEFT", "LEFT", String(timeout)]);
      const moved = movedRaw ? String(movedRaw) : null;
      if (!moved) continue;
      const fin = await finalizeClaimedPostIngest(client, { moved, cid, lane, procKey, leaseMs, cursor });
      if (fin) return fin;
    }
    await cleanupConvIfEmpty(client, cid);
  }
  return null;
}

export async function ackPostIngestProcessing(leasedJobStr: string): Promise<void> {
  const client = await getRedisInboundOpsClient();
  if (!client) return;
  let job: PostIngestJobV2 | null = null;
  try {
    job = parsePostIngestJobV2(JSON.parse(leasedJobStr));
  } catch {
    return;
  }
  if (!job) return;
  const shard = processingShardForConversation(job.conversation_id);
  await client.lRem(processingListKey(shard), 1, leasedJobStr);
}

export function defaultInboundLeaseMs(): number {
  const n = Number(process.env.INBOUND_POST_INGEST_LEASE_MS || 120_000);
  return Number.isFinite(n) && n >= 10_000 && n <= 900_000 ? n : 120_000;
}

export function defaultInboundMaxRetries(): number {
  const n = Number(process.env.INBOUND_POST_INGEST_MAX_RETRIES || 8);
  return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.floor(n) : 8;
}

function backoffMsForRetry(retry: number): number {
  const base = 500 * 2 ** Math.min(retry, 16);
  return Math.min(base, 30_000);
}

/**
 * Reclaim stale jobs from all processing shards: increment retry, requeue or DLQ.
 */
export async function requeueStaleInboundProcessing(): Promise<{ requeued: number; dead: number }> {
  const client = await getRedisInboundOpsClient();
  if (!client) return { requeued: 0, dead: 0 };
  const maxRetries = defaultInboundMaxRetries();
  const shardCount = defaultProcessingShardCount();
  let requeued = 0;
  let dead = 0;
  const now = Date.now();

  for (let shard = 0; shard < shardCount; shard++) {
    const procKey = processingListKey(shard);
    const items = await client.lRange(procKey, 0, 499);
    for (const line of items) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        await client.lRem(procKey, 1, line);
        continue;
      }
      const job = parsePostIngestJobV2(parsed);
      if (!job) {
        await client.lRem(procKey, 1, line);
        continue;
      }
      const leaseUntil = job.lease_until ?? 0;
      if (leaseUntil > now) continue;

      await client.lRem(procKey, 1, line);
      const nextRetry = (job.retry_count ?? 0) + 1;
      if (nextRetry > maxRetries) {
        const corpse = {
          ...job,
          dead_at: new Date().toISOString(),
          dead_reason: "max_retries_exceeded",
          final_retry_count: nextRetry,
        };
        await client.rPush(DLQ_LIST, JSON.stringify(corpse));
        dead += 1;
        continue;
      }
      const delay = backoffMsForRetry(nextRetry - 1);
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
      const stripped: PostIngestJobV2 = {
        ...job,
        retry_count: nextRetry,
        claimed_at: undefined,
        lease_until: undefined,
        first_enqueued_at: job.first_enqueued_at,
        enqueued_at: new Date().toISOString(),
      };
      await client.rPush(convQueueKeyForPostIngestJob(job), serializePostIngestJobV2(stripped));
      await client.sAdd(CONV_PENDING_SET, String(job.conversation_id));
      await updateConvHeadPriority(client, job.conversation_id, job.priority);
      requeued += 1;
    }
  }
  return { requeued, dead };
}

export { DLQ_LIST, CONV_PENDING_SET };
