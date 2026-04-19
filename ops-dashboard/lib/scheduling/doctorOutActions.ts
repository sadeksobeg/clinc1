import type { Pool } from "pg";
import { DateTime } from "luxon";
import { resolveOpenConversationId } from "@/lib/conversations/pendingCoalesce";
import { enqueueCoreOutbox } from "@/lib/outbox/coreOutbox";
import { isPatientRecentlyActive } from "@/lib/whatsapp/replyWindow";

export type DoctorOutParams = {
  clinicId: number;
  doctorId: number;
  shiftMinutes: number;
  actorStaffId?: number | null;
};

/**
 * Shifts all remaining appointments for the doctor today (clinic TZ) by the same delta.
 * Logs reschedules and enqueues patient notifications.
 */
export async function doctorOutShiftRemaining(pool: Pool, p: DoctorOutParams): Promise<{ shifted: number }> {
  const tzR = await pool.query(`SELECT timezone FROM clinics WHERE id = $1`, [p.clinicId]);
  const zone = (tzR.rows[0]?.timezone as string) || "Asia/Amman";
  const now = DateTime.utc().setZone(zone);
  const dayStart = now.startOf("day").toUTC().toISO()!;
  const dayEnd = now.endOf("day").toUTC().toISO()!;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM doctors WHERE id = $1 AND clinic_id = $2 FOR UPDATE`, [
      p.doctorId,
      p.clinicId,
    ]);

    const list = await client.query(
      `SELECT id, patient_id, starts_at, ends_at FROM appointments
       WHERE clinic_id = $1 AND doctor_id = $2 AND deleted_at IS NULL
         AND status IN ('confirmed', 'pending')
         AND starts_at >= $3::timestamptz AND starts_at <= $4::timestamptz
         AND starts_at > NOW()
       ORDER BY starts_at ASC
       FOR UPDATE`,
      [p.clinicId, p.doctorId, dayStart, dayEnd],
    );

    let shifted = 0;
    for (const row of list.rows as { id: number; patient_id: number; starts_at: string; ends_at: string }[]) {
      const oldS = row.starts_at;
      const oldE = row.ends_at;
      await client.query(
        `UPDATE appointments
         SET starts_at = starts_at + ($1::int * interval '1 minute'),
             ends_at = ends_at + ($1::int * interval '1 minute'),
             updated_at = NOW()
         WHERE id = $2`,
        [p.shiftMinutes, row.id],
      );
      const nr = await client.query(`SELECT starts_at, ends_at FROM appointments WHERE id = $1`, [row.id]);
      const ns = nr.rows[0].starts_at as string;
      const ne = nr.rows[0].ends_at as string;
      await client.query(
        `INSERT INTO reschedule_logs (clinic_id, appointment_id, old_starts_at, new_starts_at, reason, actor_staff_id)
         VALUES ($1, $2, $3::timestamptz, $4::timestamptz, 'doctor_out', $5)`,
        [p.clinicId, row.id, oldS, ns, p.actorStaffId ?? null],
      );
      const body = `تم تعديل موعدك بسبب ظروف العيادة. الموعد الجديد: ${DateTime.fromISO(ns, { zone: "utc" }).setZone(zone).toFormat("yyyy-LL-dd HH:mm")}. نعتذر عن الإزعاج.`;
      const dedupe = `reschedule:${row.id}:${ns}`;
      const pr = await client.query(`SELECT chat_id FROM patients WHERE id = $1 AND clinic_id = $2`, [
        row.patient_id,
        p.clinicId,
      ]);
      const chatId = String((pr.rows[0] as { chat_id?: string } | undefined)?.chat_id || "").trim();
      if (chatId) {
        const recent = await isPatientRecentlyActive(client, { clinicId: p.clinicId, patientId: row.patient_id });
        if (!recent) continue;
        const openConvId = await resolveOpenConversationId(client, p.clinicId, row.patient_id);
        await enqueueCoreOutbox(client, {
          clinic_id: p.clinicId,
          conversation_id: openConvId,
          job_type: "whatsapp_send",
          payload: {
            to: chatId,
            text: body,
            kind: "doctor_reschedule",
            dedupe,
            appointment_id: row.id,
            patient_id: row.patient_id,
          },
        });
      }
      shifted += 1;
    }

    const queueDate = now.toFormat("yyyy-LL-dd");
    await client.query(
      `INSERT INTO clinic_day_queue_state (clinic_id, doctor_id, queue_date, doctor_available, metadata, updated_at)
       VALUES ($1, $2, $3::date, FALSE, jsonb_build_object('reason','doctor_out'), NOW())
       ON CONFLICT (clinic_id, doctor_id, queue_date)
       DO UPDATE SET doctor_available = FALSE, metadata = clinic_day_queue_state.metadata || jsonb_build_object('reason','doctor_out'), updated_at = NOW()`,
      [p.clinicId, p.doctorId, queueDate],
    );

    await client.query("COMMIT");
    return { shifted };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
