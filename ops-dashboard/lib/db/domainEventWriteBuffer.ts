import type { Pool } from "pg";
import { appendDomainEvent, type DomainEventInput } from "@/lib/domain/domainEvents";
import { getRedisInboundOpsClient } from "@/lib/messaging/redisInboundOpsClient";
import { appendWriteBufferSpillLine, drainJsonlSpillFile } from "./writeBufferSpill";

const BUFFER_LIST_KEY = "buffer:domain_events:v1";
const SPILL_FAIL = "domain_events.spill.jsonl";
const SPILL_DUAL = "domain_events.dual.jsonl";

/**
 * Production durability: enable Redis AOF (`appendonly yes`, `appendfsync everysec`) so in-memory
 * lists survive process restarts. Optional `INBOUND_WRITE_BUFFER_SPILL_PATH` adds disk fallback.
 */

function bufferEnabled(): boolean {
  return (process.env.INBOUND_DOMAIN_EVENTS_REDIS_BUFFER || "").trim() === "1";
}

function spillDualWriteEnabled(): boolean {
  return (process.env.INBOUND_WRITE_BUFFER_SPILL_DUAL_WRITE || "").trim() === "1";
}

/** Phase A: optional Redis-backed buffer for non-hot-path domain_events inserts. */
export async function maybeEnqueueDomainEventAppend(input: DomainEventInput): Promise<boolean> {
  if (!bufferEnabled()) return false;
  const client = await getRedisInboundOpsClient();
  if (!client) return false;
  const line = JSON.stringify(input);
  try {
    await client.rPush(BUFFER_LIST_KEY, line);
    if (spillDualWriteEnabled()) {
      void appendWriteBufferSpillLine(SPILL_DUAL, line).catch(() => undefined);
    }
    return true;
  } catch {
    void appendWriteBufferSpillLine(SPILL_FAIL, line).catch(() => undefined);
    return false;
  }
}

/** Flush disk spill (Redis write failures) to Postgres before draining the Redis list. */
export async function drainDomainEventSpillToPostgres(pool: Pool, maxRows: number): Promise<number> {
  return drainJsonlSpillFile(SPILL_FAIL, maxRows, async (row) => {
    let input: DomainEventInput;
    try {
      input = JSON.parse(row) as DomainEventInput;
    } catch {
      return true;
    }
    try {
      await appendDomainEvent(pool, input);
      return true;
    } catch {
      return false;
    }
  });
}

export async function flushDomainEventWriteBuffer(pool: Pool, maxRows: number): Promise<number> {
  const spill = await drainDomainEventSpillToPostgres(pool, Math.min(maxRows, 100));
  if (!bufferEnabled()) return spill;
  const client = await getRedisInboundOpsClient();
  if (!client) return 0;
  const cap = Math.min(500, Math.max(1, maxRows));
  let flushed = 0;
  for (let i = 0; i < cap; i++) {
    let raw: string | null | undefined;
    try {
      raw = await client.lPop(BUFFER_LIST_KEY);
    } catch {
      break;
    }
    if (raw == null || raw === "") break;
    let input: DomainEventInput;
    try {
      input = JSON.parse(String(raw)) as DomainEventInput;
    } catch {
      continue;
    }
    try {
      await appendDomainEvent(pool, input);
      flushed += 1;
    } catch {
      try {
        await client.lPush(BUFFER_LIST_KEY, String(raw));
      } catch {
        /* drop */
      }
      break;
    }
  }
  return spill + flushed;
}
