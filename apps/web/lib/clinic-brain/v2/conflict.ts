import type { DateTime } from "luxon";
import type { AppointmentRow } from "@/lib/ops-server";
import { isAppointmentDone } from "@/lib/scheduling-engine";

/**
 * Who should be served first when multiple appointments compete (same slot or overload).
 * Order: emergency → checked_in → late → expected → by earliest scheduled start → id.
 */
export function operationalPriorityScore(a: AppointmentRow): number {
  if (a.source_channel === "whatsapp_emergency") return 400;
  const arr = String(a.patient_arrival_state || "").toLowerCase();
  if (arr === "checked_in") return 300;
  if (arr === "late") return 200;
  if (arr === "expected") return 100;
  return 50;
}

export function compareOperationalPriority(
  a: AppointmentRow,
  b: AppointmentRow,
  getLocalStart: (x: AppointmentRow) => DateTime | null,
): number {
  const pa = operationalPriorityScore(a);
  const pb = operationalPriorityScore(b);
  if (pa !== pb) return pb - pa;
  const ta = getLocalStart(a);
  const tb = getLocalStart(b);
  if (ta && tb) {
    const d = ta.toMillis() - tb.toMillis();
    if (d !== 0) return d;
  }
  return a.id - b.id;
}

/** Deterministic queue order for a conflicting group (same calendar minute). */
export function resolveConflictOrder(
  appointments: AppointmentRow[],
  getLocalStart: (x: AppointmentRow) => DateTime | null,
): AppointmentRow[] {
  return [...appointments].sort((a, b) => compareOperationalPriority(a, b, getLocalStart));
}

/** Groups appointments that share the same scheduled start minute (potential double-booking). */
export function groupSameScheduledMinute(
  appointments: AppointmentRow[],
  getLocalStart: (x: AppointmentRow) => DateTime | null,
): AppointmentRow[][] {
  const map = new Map<string, AppointmentRow[]>();
  for (const a of appointments) {
    if (isAppointmentDone(a)) continue;
    const t = getLocalStart(a);
    const key = t?.isValid ? t.startOf("minute").toISO() ?? `id:${a.id}` : `id:${a.id}`;
    const list = map.get(key) ?? [];
    list.push(a);
    map.set(key, list);
  }
  return Array.from(map.values()).filter((g) => g.length > 1);
}
