import { DateTime } from "luxon";
import { toClinicZoned } from "@/lib/format";
import type { AppointmentRow } from "@/lib/ops-server";
import { isAppointmentDone } from "@/lib/scheduling-engine";

export type WalkInPlacement = {
  nextAvailableAt: DateTime;
  expectedDelayMinutes: number;
  willDelaySubsequent: boolean;
  /** minutes before the next already-booked appointment starts. Negative/0 means it overlaps. */
  cushionToNextBookedMinutes: number | null;
};

/**
 * Derive a sensible walk-in placement given the doctor's remaining day appointments.
 * Pure: no I/O, no new APIs.
 */
export function suggestWalkInPlacement(args: {
  doctorDayAppointments: AppointmentRow[];
  now: DateTime;
  clinicTimezone: string;
  effectiveMinutesFor: (a: AppointmentRow) => number;
  /** duration we'd need to squeeze in. Default 15m. */
  walkInMinutes?: number;
}): WalkInPlacement {
  const { doctorDayAppointments, now, clinicTimezone, effectiveMinutesFor } = args;
  const walkInMinutes = Math.max(5, args.walkInMinutes ?? 15);

  const remaining = doctorDayAppointments
    .filter((a) => !isAppointmentDone(a))
    .map((a) => ({ a, local: toClinicZoned(a.starts_at, clinicTimezone) }))
    .filter((x): x is { a: AppointmentRow; local: DateTime } => Boolean(x.local))
    .sort((x, y) => x.local.toMillis() - y.local.toMillis());

  let cursor = now;
  for (const { a, local } of remaining) {
    const dur = Math.max(5, effectiveMinutesFor(a));
    if (local > cursor) {
      const end = local;
      const cushion = Math.round(end.diff(cursor, "minutes").minutes);
      if (cushion >= walkInMinutes) {
        const startAt = cursor;
        return {
          nextAvailableAt: startAt,
          expectedDelayMinutes: Math.max(0, Math.round(startAt.diff(now, "minutes").minutes)),
          willDelaySubsequent: false,
          cushionToNextBookedMinutes: cushion,
        };
      }
    }
    const projectedEnd = DateTime.max(cursor, local).plus({ minutes: dur });
    cursor = projectedEnd;
  }

  return {
    nextAvailableAt: cursor,
    expectedDelayMinutes: Math.max(0, Math.round(cursor.diff(now, "minutes").minutes)),
    willDelaySubsequent: remaining.length > 0,
    cushionToNextBookedMinutes: null,
  };
}
