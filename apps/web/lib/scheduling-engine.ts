import { DateTime } from "luxon";
import { isLateAfterGrace } from "@/lib/clinic-time";
import { toClinicZoned } from "@/lib/format";
import type { AppointmentRow } from "@/lib/ops-server";

/**
 * State-driven queue buckets (Clinic OS scheduling engine).
 * Prefer these over raw wall-clock order — "لا تدير الوقت، أدِر الحالة".
 */
export type QueueBucket = "EMERGENCY" | "NOW" | "READY" | "LATE" | "UPCOMING" | "DONE";

export type EnrichedDayAppointment = {
  appointment: AppointmentRow;
  localStart: DateTime;
  bucket: QueueBucket;
};

export const DEFAULT_VISIT_MINUTES = 15;

/** until API exposes case_type — use doctor slot length or default. */
export function estimateVisitMinutes(appointment: AppointmentRow, doctorSlotMinutes?: number | null): number {
  if (appointment.source_channel === "whatsapp_emergency") return 30;
  const m = Number(doctorSlotMinutes);
  if (Number.isFinite(m) && m >= 5) return m;
  return DEFAULT_VISIT_MINUTES;
}

export function isAppointmentDone(a: AppointmentRow): boolean {
  const s = String(a.status || "").toLowerCase();
  const ar = String(a.patient_arrival_state || "").toLowerCase();
  return s === "cancelled" || s === "completed" || s === "no_show" || ar === "no_show";
}

export function isVisitWindowActive(
  a: AppointmentRow,
  now: DateTime,
  start: DateTime,
  end: DateTime | null,
  slotFallbackMinutes: number,
): boolean {
  if (String(a.status || "").toLowerCase() === "cancelled" || String(a.status || "").toLowerCase() === "completed") {
    return false;
  }
  const until = end?.isValid ? end : start.plus({ minutes: slotFallbackMinutes });
  return now >= start && now < until;
}

export function classifyQueueBucket(args: {
  appointment: AppointmentRow;
  localStart: DateTime;
  localEnd: DateTime | null;
  now: DateTime;
  graceMinutes: number;
  slotFallbackMinutes: number;
}): QueueBucket {
  const { appointment: a, localStart: st, localEnd, now, graceMinutes, slotFallbackMinutes } = args;
  if (isAppointmentDone(a)) return "DONE";
  if (a.source_channel === "whatsapp_emergency") return "EMERGENCY";

  const arrival = String(a.patient_arrival_state || "").toLowerCase();
  const active = isVisitWindowActive(a, now, st, localEnd, slotFallbackMinutes);

  if (arrival === "checked_in" && active) return "NOW";
  if (arrival === "checked_in") return "READY";

  if (isLateAfterGrace(st, now, graceMinutes)) return "LATE";

  return "UPCOMING";
}

/** Who to call next: طوارئ → جاهزون (داخل) → موعد قادم — بدون انتظار المتأخر حتى يحضر. */
export function pickServeNextAppointment(enriched: EnrichedDayAppointment[]): AppointmentRow | null {
  const byStart = (x: EnrichedDayAppointment, y: EnrichedDayAppointment) => x.localStart.toMillis() - y.localStart.toMillis();

  const emerg = enriched.filter((e) => e.bucket === "EMERGENCY").sort(byStart);
  if (emerg.length) return emerg[0].appointment;

  const ready = enriched.filter((e) => e.bucket === "READY").sort(byStart);
  if (ready.length) return ready[0].appointment;

  const up = enriched.filter((e) => e.bucket === "UPCOMING").sort(byStart);
  if (up.length) return up[0].appointment;

  return null;
}

/** أقرب موعد تقويمي بعد الآن (للمرجع، وليس بالضرورة من يُستدعى تشغيليًا). */
export function pickCalendarNextAppointment(
  items: Array<{ appointment: AppointmentRow; localStart: DateTime }>,
  now: DateTime,
): AppointmentRow | null {
  const next = items
    .filter(({ appointment, localStart }) => !isAppointmentDone(appointment) && localStart > now)
    .sort((a, b) => a.localStart.toMillis() - b.localStart.toMillis());
  return next[0]?.appointment ?? null;
}

export type DayQueueEngineState = {
  enriched: EnrichedDayAppointment[];
  nowAppointment: AppointmentRow | null;
  serveNext: AppointmentRow | null;
  calendarNext: AppointmentRow | null;
};

export function buildDayQueueEngineState(args: {
  items: Array<{ appointment: AppointmentRow; localStart: DateTime }>;
  now: DateTime;
  clinicTimezone: string;
  graceMinutes: number;
  getSlotMinutes: (doctorId: number | null) => number;
}): DayQueueEngineState {
  const { items, now, clinicTimezone, graceMinutes, getSlotMinutes } = args;

  const enriched: EnrichedDayAppointment[] = items.map(({ appointment: a, localStart: st }) => {
    const localEnd = toClinicZoned(a.ends_at, clinicTimezone);
    const slot = getSlotMinutes(a.doctor_id);
    const bucket = classifyQueueBucket({
      appointment: a,
      localStart: st,
      localEnd: localEnd,
      now,
      graceMinutes,
      slotFallbackMinutes: slot,
    });
    return { appointment: a, localStart: st, bucket };
  });

  const nowAppointment = enriched.find((e) => e.bucket === "NOW")?.appointment ?? null;
  const serveNext = pickServeNextAppointment(enriched);
  const calendarNext = pickCalendarNextAppointment(items, now);

  return { enriched, nowAppointment, serveNext, calendarNext };
}

export function groupEnrichedForOpsPanels(enriched: EnrichedDayAppointment[]): {
  emergencies: EnrichedDayAppointment[];
  lateItems: EnrichedDayAppointment[];
  checkedInItems: EnrichedDayAppointment[];
  upcomingItems: EnrichedDayAppointment[];
} {
  const emergencies = enriched.filter((e) => e.bucket === "EMERGENCY").sort((a, b) => a.localStart.toMillis() - b.localStart.toMillis());
  const lateItems = enriched.filter((e) => e.bucket === "LATE").sort((a, b) => a.localStart.toMillis() - b.localStart.toMillis());
  const checkedInItems = enriched
    .filter((e) => e.bucket === "NOW" || e.bucket === "READY")
    .sort((a, b) => a.localStart.toMillis() - b.localStart.toMillis());
  const upcomingItems = enriched.filter((e) => e.bucket === "UPCOMING").sort((a, b) => a.localStart.toMillis() - b.localStart.toMillis());

  return { emergencies, lateItems, checkedInItems, upcomingItems };
}
