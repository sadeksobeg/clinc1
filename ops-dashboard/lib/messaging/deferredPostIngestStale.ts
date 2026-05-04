import type { Pool } from "pg";
import type { PostIngestJobV2 } from "./inboundDeferredJobV2";

export function isDialogueVersionStale(current: number | undefined, snapshot: number | undefined): boolean {
  if (snapshot === undefined) return false;
  const c = current ?? 0;
  return Number.isFinite(c) && c > snapshot;
}

export async function loadCurrentDialogueVersion(
  pool: Pool,
  conversationId: number,
): Promise<number | undefined> {
  const r = await pool.query(`SELECT dialogue_version FROM conversations WHERE id = $1`, [conversationId]);
  const v = Number(r.rows[0]?.dialogue_version);
  return Number.isFinite(v) ? v : undefined;
}

export async function isDeferredPostIngestStale(pool: Pool, job: PostIngestJobV2): Promise<boolean> {
  const cur = await loadCurrentDialogueVersion(pool, job.conversation_id);
  return isDialogueVersionStale(cur, job.dialogue_version_snapshot);
}
