import type { DateTime } from "luxon";
import type { AppointmentRow } from "@/lib/ops-server";
import { isAppointmentDone } from "@/lib/scheduling-engine";
import { toClinicZoned } from "@/lib/format";
import type { AppointmentProjection } from "./projection";

export type SlaSuggestionKind = "send_delay_message" | "reschedule_or_escalate" | "mark_no_show_candidate";

export type SlaSuggestion = {
  kind: SlaSuggestionKind;
  reason: string;
  appointment_id: number;
  /** Numeric signals for audit / UI. */
  metrics: Record<string, number>;
};

const DELAY_MESSAGE_AFTER_MIN = 15;
const WAITING_ESCALATE_AFTER_MIN = 30;
const NO_SHOW_GRACE_AFTER_START_MIN = 10;

/**
 * Rules engine: proposes operational follow-ups (human still approves in current product).
 */
export function evaluateSla(args: {
  enriched: Map<number, AppointmentProjection>;
  appointments: AppointmentRow[];
  now: DateTime;
  clinicTimezone: string;
  dayKey: string;
}): SlaSuggestion[] {
  const { enriched, appointments, now, clinicTimezone, dayKey } = args;
  const suggestions: SlaSuggestion[] = [];
  const seen = new Set<string>();

  const push = (s: SlaSuggestion) => {
    const k = `${s.kind}:${s.appointment_id}`;
    if (seen.has(k)) return;
    seen.add(k);
    suggestions.push(s);
  };

  for (const a of appointments) {
    if (isAppointmentDone(a)) continue;
    const st = toClinicZoned(a.starts_at, clinicTimezone);
    if (!st?.isValid || st.toISODate() !== dayKey) continue;

    const proj = enriched.get(a.id);
    const arrival = String(a.patient_arrival_state || "").toLowerCase();
    const delay = proj?.delay_minutes ?? 0;

    if (delay > DELAY_MESSAGE_AFTER_MIN && proj) {
      push({
        kind: "send_delay_message",
        reason: `تأخير متوقع ~${delay} دقيقة عن الموعد المجدول`,
        appointment_id: a.id,
        metrics: { delay_minutes: delay },
      });
    }

    if (delay > WAITING_ESCALATE_AFTER_MIN && proj) {
      push({
        kind: "reschedule_or_escalate",
        reason: `ضغط الطابور: تأخير إسقاطي > ${WAITING_ESCALATE_AFTER_MIN} دقيقة`,
        appointment_id: a.id,
        metrics: { delay_minutes: delay },
      });
    }

    const minsSinceStart = Math.round(now.diff(st, "minutes").minutes);
    if (
      arrival === "expected" &&
      minsSinceStart >= NO_SHOW_GRACE_AFTER_START_MIN &&
      String(a.status || "").toLowerCase() !== "completed"
    ) {
      push({
        kind: "mark_no_show_candidate",
        reason: `مر وقت الموعد بأكثر من ${NO_SHOW_GRACE_AFTER_START_MIN} دقيقة دون تسجيل حضور`,
        appointment_id: a.id,
        metrics: { minutes_since_scheduled_start: minsSinceStart },
      });
    }
  }

  return suggestions;
}
