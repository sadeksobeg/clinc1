import type { Pool } from "pg";
import { getRedisInboundOpsClient } from "@/lib/messaging/redisInboundOpsClient";
import { appendWriteBufferSpillLine, drainJsonlSpillFile } from "./writeBufferSpill";

const BUFFER_LIST_KEY = "buffer:outbound_messages:v1";
const SPILL_FAIL = "outbound_messages.spill.jsonl";
const SPILL_DUAL = "outbound_messages.dual.jsonl";

/**
 * Production durability: enable Redis AOF (`appendonly yes`, `appendfsync everysec`). Optional
 * `INBOUND_WRITE_BUFFER_SPILL_PATH` + `INBOUND_WRITE_BUFFER_SPILL_DUAL_WRITE=1` for disk fallback.
 */

export type OutboundMessageBufferPayload = {
  clinic_id: number;
  patient_id: number;
  conversation_id: number;
  reply_text: string;
  intent: string;
  priority: number;
  is_urgent: boolean;
  payload: Record<string, unknown>;
};

function bufferEnabled(): boolean {
  return (process.env.INBOUND_OUTBOUND_DB_WRITE_BUFFER || "").trim() === "1";
}

function spillDualWriteEnabled(): boolean {
  return (process.env.INBOUND_WRITE_BUFFER_SPILL_DUAL_WRITE || "").trim() === "1";
}

/**
 * Phase B (optional): buffer outbound `messages` inserts from the booking FSM path.
 * Global FIFO list; flush preserves enqueue order (approximates per-conversation ordering under one worker).
 */
export async function maybeEnqueueOutboundMessageRow(args: OutboundMessageBufferPayload): Promise<boolean> {
  if (!bufferEnabled()) return false;
  const client = await getRedisInboundOpsClient();
  if (!client) return false;
  const line = JSON.stringify(args);
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

export async function drainOutboundMessageSpillToPostgres(pool: Pool, maxRows: number): Promise<number> {
  return drainJsonlSpillFile(SPILL_FAIL, maxRows, async (row) => {
    let r: OutboundMessageBufferPayload;
    try {
      r = JSON.parse(row) as OutboundMessageBufferPayload;
    } catch {
      return true;
    }
    try {
      await pool.query(
        `INSERT INTO messages (
           clinic_id, conversation_id, patient_id, direction, text, intent, priority, is_urgent, dedup_skipped, source, payload, created_at
         ) VALUES (
           $1, $2, $3, 'outbound', $4, $5, $6, $7, false, 'process_inbound', $8::jsonb, NOW()
         )`,
        [
          r.clinic_id,
          r.conversation_id,
          r.patient_id,
          r.reply_text,
          r.intent.slice(0, 120),
          r.priority,
          r.is_urgent,
          JSON.stringify(r.payload),
        ],
      );
      return true;
    } catch {
      return false;
    }
  });
}

export async function flushOutboundMessageWriteBuffer(pool: Pool, maxRows: number): Promise<number> {
  const spill = await drainOutboundMessageSpillToPostgres(pool, Math.min(maxRows, 50));
  if (!bufferEnabled()) return spill;
  const client = await getRedisInboundOpsClient();
  if (!client) return 0;
  const cap = Math.min(200, Math.max(1, maxRows));
  let flushed = 0;
  for (let i = 0; i < cap; i++) {
    let raw: string | null | undefined;
    try {
      raw = await client.lPop(BUFFER_LIST_KEY);
    } catch {
      break;
    }
    if (raw == null || raw === "") break;
    let row: OutboundMessageBufferPayload;
    try {
      row = JSON.parse(String(raw)) as OutboundMessageBufferPayload;
    } catch {
      continue;
    }
    try {
      await pool.query(
        `INSERT INTO messages (
           clinic_id, conversation_id, patient_id, direction, text, intent, priority, is_urgent, dedup_skipped, source, payload, created_at
         ) VALUES (
           $1, $2, $3, 'outbound', $4, $5, $6, $7, false, 'process_inbound', $8::jsonb, NOW()
         )`,
        [
          row.clinic_id,
          row.conversation_id,
          row.patient_id,
          row.reply_text,
          row.intent.slice(0, 120),
          row.priority,
          row.is_urgent,
          JSON.stringify(row.payload),
        ],
      );
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
