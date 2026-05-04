import { DateTime } from "luxon";
import type { InboxRow } from "@/lib/ops-server";

function lastMessageMillis(row: InboxRow): number {
  const raw = row.last_message_at;
  if (!raw) return 0;
  const dt = DateTime.fromISO(String(raw));
  return dt.isValid ? dt.toMillis() : 0;
}

/**
 * Merge server inbox rows with local state without clobbering newer `last_message_at` (reduces refresh vs optimistic races).
 */
export function mergeInboxRows(prev: InboxRow[], next: InboxRow[]): InboxRow[] {
  const prevMap = new Map(prev.map((r) => [r.conversation_id, r]));
  return next.map((n) => {
    const p = prevMap.get(n.conversation_id);
    if (!p) return n;
    return lastMessageMillis(n) >= lastMessageMillis(p) ? n : p;
  });
}
