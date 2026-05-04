import type { DateTime } from "luxon";
import type { AppointmentRow, DoctorRow } from "@/lib/ops-server";
import {
  DEFAULT_VISIT_MINUTES,
  type DayQueueEngineState,
} from "@/lib/scheduling-engine";
import { getLearnedAverageMinutes } from "@/lib/doctor-duration-learning";
import type { ProjectedSlot } from "@/lib/queue-projection";

export type NextToCallDecision = {
  appointment: AppointmentRow | null;
  serveNext: AppointmentRow | null;
  calendarNext: AppointmentRow | null;
  isServeCalendarConflict: boolean;
};

/**
 * The canonical "who to call next" decision.
 * serveNext is authoritative; calendarNext is only a reference.
 */
export function pickNextToCall(queue: Pick<DayQueueEngineState, "serveNext" | "calendarNext">): NextToCallDecision {
  const { serveNext, calendarNext } = queue;
  const appointment = serveNext ?? calendarNext ?? null;
  const isServeCalendarConflict = Boolean(
    serveNext && calendarNext && serveNext.id !== calendarNext.id,
  );
  return { appointment, serveNext, calendarNext, isServeCalendarConflict };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export type DurationSource = "historical_median" | "learned_avg" | "doctor_slot" | "default";

export type EffectiveDurationResult = {
  minutes: number;
  source: DurationSource;
};

/**
 * historicalMedianByDoctor → learned avg → doctor slot → DEFAULT_VISIT_MINUTES.
 * `historicalSamplesByDoctor` is optional: if provided, median wins over the learned avg.
 */
export function effectiveDuration(
  appointment: AppointmentRow,
  doctor: Pick<DoctorRow, "slot_duration_minutes"> | null | undefined,
  historicalSamplesByDoctor?: Map<number, number[]>,
): EffectiveDurationResult {
  if (appointment.source_channel === "whatsapp_emergency") {
    return { minutes: 30, source: "default" };
  }
  const samples = appointment.doctor_id != null ? historicalSamplesByDoctor?.get(appointment.doctor_id) : null;
  const med = samples && samples.length >= 3 ? median(samples) : null;
  if (med != null) return { minutes: med, source: "historical_median" };

  const learned = getLearnedAverageMinutes(appointment.doctor_id);
  if (learned != null) return { minutes: learned, source: "learned_avg" };

  const slot = Number(doctor?.slot_duration_minutes);
  if (Number.isFinite(slot) && slot >= 5) return { minutes: slot, source: "doctor_slot" };

  return { minutes: DEFAULT_VISIT_MINUTES, source: "default" };
}

export type LoadLevel = "normal" | "high" | "critical";

export type LoadSnapshot = {
  level: LoadLevel;
  totalDelayMinutes: number;
  lateCount: number;
  checkedInCount: number;
  reason: string | null;
};

/** Derives a single load signal from the queue state — used to show a HIGH_LOAD badge. */
export function loadLevel(args: {
  lateCount: number;
  checkedInCount: number;
  projection: Map<number, ProjectedSlot>;
  now?: DateTime;
}): LoadSnapshot {
  const { lateCount, checkedInCount, projection } = args;
  let totalDelay = 0;
  projection.forEach((p) => {
    if (p.delay_minutes > 0) totalDelay += p.delay_minutes;
  });

  if (lateCount >= 3 || totalDelay > 60) {
    return {
      level: "critical",
      totalDelayMinutes: totalDelay,
      lateCount,
      checkedInCount,
      reason: lateCount >= 3 ? "عدد كبير من المتأخرين" : "تراكم تأخير مرتفع",
    };
  }
  if (lateCount >= 2 || totalDelay > 30 || checkedInCount >= 4) {
    return {
      level: "high",
      totalDelayMinutes: totalDelay,
      lateCount,
      checkedInCount,
      reason: totalDelay > 30 ? "تأخير متراكم" : checkedInCount >= 4 ? "ضغط داخل العيادة" : "متأخرون متعددون",
    };
  }
  return { level: "normal", totalDelayMinutes: totalDelay, lateCount, checkedInCount, reason: null };
}
