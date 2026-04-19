import type { Pool } from "pg";
import { DateTime } from "luxon";

export type ReminderRow = {
  appointment_id: number;
  clinic_id: number;
  patient_id: number;
  chat_id: string;
  starts_at: string;
  body_ar: string;
};

/**
 * Appointments confirmed, reminder not sent, starting in ~30 minutes.
 * Window [27m, 33m] works with a 5-minute cron without double-sends at edges.
 */
export async function loadDueReminders(pool: Pool, clinicId?: number): Promise<ReminderRow[]> {
  const params: unknown[] = [];
  let clinicFilter = "";
  if (clinicId != null) {
    params.push(clinicId);
    clinicFilter = `AND a.clinic_id = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT a.id AS appointment_id, a.clinic_id, a.patient_id, p.chat_id, a.starts_at::text AS starts_at,
            COALESCE(c.timezone, 'Asia/Amman') AS timezone
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
     JOIN clinics c ON c.id = a.clinic_id
     WHERE a.deleted_at IS NULL AND a.status = 'confirmed' AND a.reminder_sent_at IS NULL
       AND a.starts_at > NOW() + interval '27 minutes'
       AND a.starts_at <= NOW() + interval '33 minutes'
       ${clinicFilter}
     ORDER BY a.starts_at ASC
     LIMIT 200`,
    params,
  );
  return (
    r.rows as {
      appointment_id: number;
      clinic_id: number;
      patient_id: number;
      chat_id: string;
      starts_at: string;
      timezone: string;
    }[]
  ).map((row) => {
    const z = row.timezone || "Asia/Amman";
    const t = DateTime.fromISO(row.starts_at, { zone: "utc" }).setZone(z);
    const when = t.isValid ? t.toFormat("yyyy-LL-dd HH:mm") : row.starts_at;
    return {
      appointment_id: row.appointment_id,
      clinic_id: row.clinic_id,
      patient_id: row.patient_id,
      chat_id: row.chat_id,
      starts_at: row.starts_at,
      body_ar: `تذكير: موعدك عند ${when} (${z}). نراك في العيادة.`,
    };
  });
}

export async function markReminderSent(pool: Pool, appointmentId: number): Promise<void> {
  await pool.query(`UPDATE appointments SET reminder_sent_at = NOW(), updated_at = NOW() WHERE id = $1`, [
    appointmentId,
  ]);
}
