import type { Pool, PoolClient } from "pg";
import { markReminderSent } from "@/lib/scheduling/reminderActions";

const COALESCE_KEY = "pending_reply_coalesce";

export type CoalesceBlock = { text: string; mark_reminder_after_send?: number };

export type PendingReplyCoalesce = { blocks: CoalesceBlock[] };

function parseCoalesce(raw: unknown): PendingReplyCoalesce {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { blocks: [] };
  const o = raw as Record<string, unknown>;
  const blocks = o.blocks;
  if (!Array.isArray(blocks)) return { blocks: [] };
  const out: CoalesceBlock[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const t = (b as { text?: unknown }).text;
    if (typeof t !== "string" || !t.trim()) continue;
    const m = (b as { mark_reminder_after_send?: unknown }).mark_reminder_after_send;
    out.push({
      text: t.trim(),
      mark_reminder_after_send: typeof m === "number" && Number.isFinite(m) ? m : undefined,
    });
  }
  return { blocks: out };
}

export async function resolveOpenConversationId(
  pool: Pool | PoolClient,
  clinicId: number,
  patientId: number,
): Promise<number | null> {
  const r = await pool.query(
    `SELECT id FROM conversations
     WHERE clinic_id = $1 AND patient_id = $2 AND status = 'open' AND deleted_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [clinicId, patientId],
  );
  const id = r.rows[0]?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/** Append a deferred proactive line so the next inbound reply can merge (anti-spam). */
export async function appendPendingCoalesceBlock(
  pool: Pool | PoolClient,
  args: { conversationId: number; clinicId: number; block: CoalesceBlock },
): Promise<void> {
  const row = await pool.query(`SELECT dialogue_state FROM conversations WHERE id = $1 AND clinic_id = $2`, [
    args.conversationId,
    args.clinicId,
  ]);
  const ds = (row.rows[0]?.dialogue_state as Record<string, unknown>) || {};
  const cur = parseCoalesce(ds[COALESCE_KEY]);
  cur.blocks.push(args.block);
  ds[COALESCE_KEY] = cur;
  await pool.query(
    `UPDATE conversations
     SET dialogue_state = COALESCE(dialogue_state, '{}'::jsonb) || $1::jsonb,
         dialogue_version = dialogue_version + 1,
         updated_at = NOW()
     WHERE id = $2 AND clinic_id = $3`,
    [JSON.stringify({ [COALESCE_KEY]: cur }), args.conversationId, args.clinicId],
  );
}

const MAX_MERGED_LEN = 3500;

/** Exported for unit tests (CRM may store unmerged text while WhatsApp uses merged copy). */
export function mergePreambleAndReply(preambleParts: string[], reply: string): string {
  const p = preambleParts.filter(Boolean).join("\n\n").trim();
  const rep = reply.trim();
  if (!p) return rep.slice(0, MAX_MERGED_LEN);
  if (!rep) return p.slice(0, MAX_MERGED_LEN);
  const sep = "\n\n";
  if (p.length + sep.length + rep.length <= MAX_MERGED_LEN) return p + sep + rep;
  const budget = MAX_MERGED_LEN - rep.length - sep.length;
  if (budget < 40) return rep.slice(0, MAX_MERGED_LEN);
  const shortened = p.length > budget ? `…\n${p.slice(-(budget - 4))}` : p;
  return (shortened + sep + rep).slice(0, MAX_MERGED_LEN);
}

/**
 * Prefixes queued proactive lines to the outbound patient text, clears queue, marks reminders.
 */
export async function mergePendingCoalesceIntoReply(
  pool: Pool,
  args: { conversationId: number; clinicId: number; replyText: string },
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT dialogue_state FROM conversations WHERE id = $1 AND clinic_id = $2 FOR UPDATE`,
      [args.conversationId, args.clinicId],
    );
    const dsRaw = r.rows[0]?.dialogue_state;
    const co = parseCoalesce(
      dsRaw && typeof dsRaw === "object" && !Array.isArray(dsRaw)
        ? (dsRaw as Record<string, unknown>)[COALESCE_KEY]
        : undefined,
    );
    if (!co.blocks.length) {
      await client.query("COMMIT");
      return args.replyText;
    }
    const reminderIds = new Set<number>();
    const lines: string[] = [];
    for (const b of co.blocks) {
      lines.push(b.text);
      if (typeof b.mark_reminder_after_send === "number" && Number.isFinite(b.mark_reminder_after_send)) {
        reminderIds.add(b.mark_reminder_after_send);
      }
    }
    const merged = mergePreambleAndReply(lines, args.replyText);
    await client.query(
      `UPDATE conversations
       SET dialogue_state = COALESCE(dialogue_state, '{}'::jsonb) - $3::text,
           dialogue_version = dialogue_version + 1,
           updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2`,
      [args.conversationId, args.clinicId, COALESCE_KEY],
    );
    await client.query("COMMIT");
    for (const aid of reminderIds) {
      await markReminderSent(pool, aid);
    }
    return merged;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
