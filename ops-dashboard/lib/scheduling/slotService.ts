import type { Pool } from "pg";
import { DateTime } from "luxon";
import { pickFirstFreeSlots, type BusyInterval } from "./availabilityEngine";
import type { SlotOffer } from "./types";
import { isWithinWorkingHours, luxonWeekdayToDb, type DayHours } from "./workingHoursGuard";

export type FindSlotsParams = {
  clinicId: number;
  doctorId?: number;
  specialty?: string;
  limit?: number;
  horizonDays?: number;
  /** When set, `routing.selected_clinic_id` overrides `clinicId` for slot search (same as internal slots API). */
  conversationId?: number;
};

async function resolveSchedulingClinicId(pool: Pool, params: FindSlotsParams): Promise<number> {
  let clinicId = params.clinicId;
  if (params.conversationId) {
    const r = await pool.query(`SELECT routing, clinic_id FROM conversations WHERE id = $1`, [params.conversationId]);
    const row = r.rows[0] as { routing: { selected_clinic_id?: number }; clinic_id: number } | undefined;
    const sel = row?.routing && typeof row.routing === "object" ? row.routing.selected_clinic_id : undefined;
    if (typeof sel === "number") clinicId = sel;
  }
  return clinicId;
}

export async function resolveDoctorId(pool: Pool, p: FindSlotsParams): Promise<number | null> {
  if (p.doctorId) return p.doctorId;
  if (p.specialty) {
    const r = await pool.query(
      `SELECT id FROM doctors
       WHERE clinic_id = $1 AND is_active = TRUE AND deleted_at IS NULL
         AND lower(specialty) = lower($2)
       ORDER BY id ASC LIMIT 1`,
      [p.clinicId, p.specialty],
    );
    return r.rows[0]?.id ?? null;
  }
  const r = await pool.query(
    `SELECT id FROM doctors
     WHERE clinic_id = $1 AND is_active = TRUE AND deleted_at IS NULL
     ORDER BY id ASC LIMIT 1`,
    [p.clinicId],
  );
  return r.rows[0]?.id ?? null;
}

export async function findNextSlots(pool: Pool, params: FindSlotsParams): Promise<SlotOffer[]> {
  const clinicId = await resolveSchedulingClinicId(pool, params);
  const paramsWithClinic = { ...params, clinicId };
  const limit = paramsWithClinic.limit ?? 3;
  const horizonDays = paramsWithClinic.horizonDays ?? 14;
  const doctorId = await resolveDoctorId(pool, paramsWithClinic);
  if (!doctorId) return [];

  const doc = await pool.query(
    `SELECT d.id, d.display_name, d.slot_duration_minutes, c.timezone
     FROM doctors d JOIN clinics c ON c.id = d.clinic_id
     WHERE d.id = $1 AND d.clinic_id = $2 AND d.deleted_at IS NULL`,
    [doctorId, clinicId],
  );
  const row = doc.rows[0] as
    | { id: number; display_name: string; slot_duration_minutes: number; timezone: string }
    | undefined;
  if (!row) return [];

  const wh = await pool.query(
    `SELECT weekday, opens_at::text AS opens, closes_at::text AS closes
     FROM doctor_working_hours WHERE doctor_id = $1`,
    [doctorId],
  );
  const map = new Map<number, { opens: string; closes: string }>();
  for (const w of wh.rows as { weekday: number; opens: string; closes: string }[]) {
    map.set(w.weekday, { opens: w.opens.slice(0, 8), closes: w.closes.slice(0, 8) });
  }

  const zone = row.timezone || "Asia/Amman";
  const now = DateTime.utc();
  const localDays: DateTime[] = [];
  let d = now.setZone(zone).startOf("day");
  for (let i = 0; i < horizonDays; i += 1) {
    localDays.push(d.plus({ days: i }));
  }

  const fromUtc = now.minus({ hours: 1 });
  const toUtc = now.plus({ days: horizonDays + 1 });
  const busyR = await pool.query(
    `SELECT starts_at, ends_at FROM appointments
     WHERE doctor_id = $1 AND deleted_at IS NULL
       AND status NOT IN ('cancelled', 'no_show')
       AND starts_at < $3 AND ends_at > $2`,
    [doctorId, fromUtc.toISO(), toUtc.toISO()],
  );
  const busy: BusyInterval[] = busyR.rows.map((b: { starts_at: string; ends_at: string }) => ({
    start: DateTime.fromISO(b.starts_at, { zone: "utc" }),
    end: DateTime.fromISO(b.ends_at, { zone: "utc" }),
  }));

  const leaveR = await pool.query(
    `SELECT starts_at, ends_at FROM doctor_leaves WHERE doctor_id = $1 AND ends_at > $2 AND starts_at < $3`,
    [doctorId, fromUtc.toISO(), toUtc.toISO()],
  );
  for (const b of leaveR.rows as { starts_at: string; ends_at: string }[]) {
    busy.push({
      start: DateTime.fromISO(b.starts_at, { zone: "utc" }),
      end: DateTime.fromISO(b.ends_at, { zone: "utc" }),
    });
  }

  const weekdayToHours = new Map<number, { opens: string; closes: string }>();
  for (const [k, v] of map) {
    weekdayToHours.set(k, v);
  }

  const picked = pickFirstFreeSlots(zone, localDays, weekdayToHours, row.slot_duration_minutes, busy, limit);
  return picked.map((s) => ({
    starts_at: s.startUtc.toISO()!,
    ends_at: s.endUtc.toISO()!,
    doctor_id: row.id,
    doctor_name: row.display_name,
  }));
}

export function dbWeekdayFromLuxonLocal(dt: DateTime): number {
  return luxonWeekdayToDb(dt.weekday);
}

/** When no slots are returned, explain why (closed vs full vs misconfigured) for WhatsApp UX. */
export async function explainNoSlots(pool: Pool, params: FindSlotsParams): Promise<{ closed_message_ar: string }> {
  const clinicId = await resolveSchedulingClinicId(pool, params);
  const p = { ...params, clinicId };
  const doctorId = await resolveDoctorId(pool, p);
  if (!doctorId) {
    return { closed_message_ar: "لا يوجد طبيب نشط لهذه العيادة أو التخصص المطلوب." };
  }
  const doc = await pool.query(
    `SELECT c.timezone FROM doctors d JOIN clinics c ON c.id = d.clinic_id
     WHERE d.id = $1 AND d.clinic_id = $2 AND d.deleted_at IS NULL`,
    [doctorId, clinicId],
  );
  const zone = (doc.rows[0]?.timezone as string) || "Asia/Amman";
  const wh = await pool.query(
    `SELECT weekday, opens_at::text AS opens, closes_at::text AS closes
     FROM doctor_working_hours WHERE doctor_id = $1`,
    [doctorId],
  );
  if (!wh.rows.length) {
    return { closed_message_ar: "لم تُعرّف أوقات عمل للطبيب بعد. يرجى التواصل مع الإدارة." };
  }
  const hoursRows: DayHours[] = (wh.rows as { weekday: number; opens: string; closes: string }[]).map((r) => ({
    weekday: r.weekday,
    opens: r.opens.slice(0, 8),
    closes: r.closes.slice(0, 8),
  }));
  const { open, todayLine } = isWithinWorkingHours(zone, DateTime.utc(), hoursRows);
  if (!open) {
    return { closed_message_ar: todayLine || "العيادة مغلقة حالياً حسب الجدول." };
  }
  return { closed_message_ar: "المواعيد القريبة ممتلئة. جرّب لاحقاً أو تواصل مع السكرتارية." };
}
