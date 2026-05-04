import { DateTime } from "luxon";
import type { AppointmentRow } from "@/lib/ops-server";
import { toClinicZoned } from "@/lib/format";
import { appointmentIsActiveNow } from "@/lib/operational-appointment";

/** مراحل دورة تشغيل موعد واحد داخل «جلسة العمل» النشطة (الانتهاء = إزالة الجلسة وليس مرحلة منفصلة). */
export type OperationalSessionPhase = "WAITING" | "CALLED" | "IN_PROGRESS";

export type ActiveOperationalSession = {
  appointmentId: number;
  state: OperationalSessionPhase;
  /** وقت بدء قفل الجلسة على هذا الموعد (ms). */
  startedAt: number;
  /** إن وُجد: لا يُعاد اشتقاق المرحلة من الجدول حتى هذا الوقت (مثلاً بعد START يدوي). */
  phaseLockUntilMs?: number | null;
};

/** تسمية عربية قصيرة لعرض الواجهة. */
export function operationalSessionPhaseLabelAr(phase: OperationalSessionPhase): string {
  switch (phase) {
    case "WAITING":
      return "في انتظار التشغيل";
    case "CALLED":
      return "تم الاستدعاء — داخل العيادة";
    case "IN_PROGRESS":
      return "كشف جارٍ";
    default:
      return phase;
  }
}

/**
 * يستنتج مرحلة الجلسة من صف الموعد الحالي.
 * يعيد null إذا انتهى الموعد تشغيليًا (لا جلسة نشطة).
 */
export function deriveOperationalSessionPhase(
  a: AppointmentRow,
  nowZoned: DateTime,
  clinicTimezone: string,
): OperationalSessionPhase | null {
  const statusRaw = String(a.status || "").toLowerCase();
  if (statusRaw === "completed" || statusRaw === "cancelled" || statusRaw === "no_show") return null;

  const arrivalRaw = String(a.patient_arrival_state || "").toLowerCase();

  if (arrivalRaw === "checked_in") {
    const st = toClinicZoned(a.starts_at, clinicTimezone);
    const en = toClinicZoned(a.ends_at, clinicTimezone);
    if (st?.isValid && en?.isValid && appointmentIsActiveNow(a, nowZoned, st, en)) return "IN_PROGRESS";
    return "CALLED";
  }

  return "WAITING";
}

/**
 * يبني كائن جلسة من موعد حالي؛ null إذا كان الموعد منتهيًا أصلًا.
 */
export function createActiveOperationalSession(
  appointmentId: number,
  row: AppointmentRow | null | undefined,
  nowZoned: DateTime,
  clinicTimezone: string,
  startedAt = Date.now(),
): ActiveOperationalSession | null {
  if (!row) {
    return { appointmentId, state: "WAITING", startedAt };
  }
  const phase = deriveOperationalSessionPhase(row, nowZoned, clinicTimezone);
  if (phase == null) return null;
  return { appointmentId, state: phase, startedAt };
}

const CALLED_STUCK_MS = 10 * 60 * 1000;

/** اقتراح انتقال عند بقاء الجلسة عالقة (مثلاً CALLED طويلاً دون START). */
export function getSessionTimeoutSuggestion(
  session: ActiveOperationalSession | null,
  nowMs: number,
): "NO_SHOW" | null {
  if (!session) return null;
  const elapsed = nowMs - session.startedAt;
  if (session.state === "CALLED" && elapsed > CALLED_STUCK_MS) {
    return "NO_SHOW";
  }
  return null;
}
