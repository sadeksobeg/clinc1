import type { InboxRow } from "@/lib/ops-server";

export function pickPriorityInboxRow(rows: InboxRow[], preferPatientId?: number | null): InboxRow | null {
  if (!rows.length) return null;
  if (preferPatientId != null && preferPatientId > 0) {
    const match = rows.find((r) => r.patient_id === preferPatientId);
    if (match) return match;
  }
  return [...rows].sort((a, b) => {
    const ua = a.last_inbound_is_urgent ? 1 : 0;
    const ub = b.last_inbound_is_urgent ? 1 : 0;
    if (ua !== ub) return ub - ua;
    const oa = a.status === "open" ? 1 : 0;
    const ob = b.status === "open" ? 1 : 0;
    if (oa !== ob) return ob - oa;
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return tb - ta;
  })[0]!;
}
