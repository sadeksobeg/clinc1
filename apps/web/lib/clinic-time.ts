import { DateTime } from "luxon";
import { clinicWeekdayDb0Sun, toClinicZoned as formatToClinicZoned } from "@/lib/format";

export { clinicWeekdayDb0Sun, toClinicZoned } from "@/lib/format";

/** Single source for "now" in clinic timezone (Luxon only — no `new Date()` here). */
export function nowInClinicTZ(clinicTimezone: string): DateTime {
  const z = String(clinicTimezone || "").trim() || "UTC";
  return DateTime.now().setZone(z);
}

export function appointmentBoundsInClinic(startsAtIso: string, endsAtIso: string, clinicTimezone: string) {
  return {
    start: formatToClinicZoned(startsAtIso, clinicTimezone),
    end: formatToClinicZoned(endsAtIso, clinicTimezone),
  };
}

/** True when `now` is after start + grace (operational lateness). */
export function isLateAfterGrace(start: DateTime, now: DateTime, graceMinutes: number): boolean {
  if (!start.isValid || !now.isValid) return false;
  return now > start.plus({ minutes: graceMinutes });
}
