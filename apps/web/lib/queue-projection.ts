import { DateTime } from "luxon";
import { toClinicZoned } from "@/lib/format";
import type { AppointmentRow } from "@/lib/ops-server";
import { classifyQueueBucket, isAppointmentDone, isVisitWindowActive, type QueueBucket } from "@/lib/scheduling-engine";

/** إسقاط زمني لطابور يوم واحد (كل طبيب على حدة) — cascade تأخير بسيط. */
export type ProjectedSlot = {
  id: number;
  doctor_id: number | null;
  scheduled_start: DateTime;
  projected_start: DateTime;
  projected_end: DateTime;
  /** موجب = بدء متأخر عن وقت الموعد المجدول */
  delay_minutes: number;
  bucket: QueueBucket;
};

function clampDelayMinutes(scheduled: DateTime, projected: DateTime): number {
  const d = Math.round(projected.diff(scheduled, "minutes").minutes);
  return d > 0 ? d : 0;
}

/**
 * يبني projected_start/projected_end لكل موعد نشط اليوم بترتيب التقويم لكل طبيب،
 * مع معالجة منطقة NOW (كشف جارٍ) باستخدام نهاية النافذة أو المدة الفعّالة.
 */
export function projectQueueTimelineForDay(args: {
  appointments: AppointmentRow[];
  now: DateTime;
  clinicTimezone: string;
  dayKey: string;
  graceMinutes: number;
  getEffectiveMinutes: (a: AppointmentRow) => number;
}): Map<number, ProjectedSlot> {
  const { appointments, now, clinicTimezone, dayKey, graceMinutes, getEffectiveMinutes } = args;

  const relevant = appointments.filter((a) => {
    const st = toClinicZoned(a.starts_at, clinicTimezone);
    if (!st?.isValid) return false;
    if (st.toISODate() !== dayKey) return false;
    if (isAppointmentDone(a)) return false;
    return true;
  });

  const byDoctor = new Map<string, AppointmentRow[]>();
  for (const a of relevant) {
    const k = String(a.doctor_id ?? "null");
    if (!byDoctor.has(k)) byDoctor.set(k, []);
    byDoctor.get(k)!.push(a);
  }

  const out = new Map<number, ProjectedSlot>();

  for (const group of Array.from(byDoctor.values())) {
    const sorted = [...group].sort((x, y) => {
      const sx = toClinicZoned(x.starts_at, clinicTimezone)!;
      const sy = toClinicZoned(y.starts_at, clinicTimezone)!;
      return sx.toMillis() - sy.toMillis();
    });

    let cursor = now;

    for (const a of sorted) {
      const st = toClinicZoned(a.starts_at, clinicTimezone)!;
      const en = toClinicZoned(a.ends_at, clinicTimezone);
      const dur = Math.max(5, getEffectiveMinutes(a));
      const slotFb = dur;

      const bucket = classifyQueueBucket({
        appointment: a,
        localStart: st,
        localEnd: en,
        now,
        graceMinutes,
        slotFallbackMinutes: slotFb,
      });

      if (bucket === "NOW") {
        const projected_end = en?.isValid ? en : st.plus({ minutes: dur });
        const floor = now > projected_end ? now.plus({ minutes: 5 }) : projected_end;
        const projected_start = st;
        out.set(a.id, {
          id: a.id,
          doctor_id: a.doctor_id,
          scheduled_start: st,
          projected_start: projected_start,
          projected_end: floor,
          delay_minutes: clampDelayMinutes(st, now < st ? st : now),
          bucket,
        });
        cursor = DateTime.max(cursor, floor);
        continue;
      }

      const projected_start = DateTime.max(cursor, st);
      const projected_end = projected_start.plus({ minutes: dur });
      out.set(a.id, {
        id: a.id,
        doctor_id: a.doctor_id,
        scheduled_start: st,
        projected_start,
        projected_end,
        delay_minutes: clampDelayMinutes(st, projected_start),
        bucket,
      });
      cursor = projected_end;
    }
  }

  return out;
}

export function maxDelayMinutesForDoctorName(
  projection: Map<number, ProjectedSlot>,
  appointments: AppointmentRow[],
  doctorName: string | null | undefined,
): number | null {
  if (!doctorName) return null;
  let max = 0;
  for (const a of appointments) {
    if (isAppointmentDone(a)) continue;
    if ((a.doctor_name ?? "") !== doctorName) continue;
    const p = projection.get(a.id);
    if (p && p.delay_minutes > max) max = p.delay_minutes;
  }
  return max > 0 ? max : null;
}
