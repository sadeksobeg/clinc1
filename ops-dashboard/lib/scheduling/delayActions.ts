import type { Pool } from "pg";
import { resolveOpenConversationId } from "@/lib/conversations/pendingCoalesce";
import { enqueueCoreOutbox } from "@/lib/outbox/coreOutbox";
import { isPatientRecentlyActive } from "@/lib/whatsapp/replyWindow";

export type MarkLateParams = {
  appointmentId: number;
  clinicId: number;
  graceMinutes?: number;
};

/** Marks patient late and queues a WhatsApp check message (outbox). */
export async function markAppointmentLate(pool: Pool, p: MarkLateParams): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(
    `UPDATE appointments
     SET patient_arrival_state = 'late', updated_at = NOW()
     WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL
       AND patient_arrival_state = 'expected'
     RETURNING id, patient_id, starts_at`,
    [p.appointmentId, p.clinicId],
  );
  if (!r.rows[0]) return { ok: false, error: "not_found" };
  const row = r.rows[0] as { patient_id: number; starts_at: string };
  const body = `لاحظنا تأخرك عن موعدك. هل ما زلت قادمًا؟ رد بكلمة «نعم» أو «لا».`;
  const chatR = await pool.query(`SELECT chat_id FROM patients WHERE id = $1 AND clinic_id = $2`, [
    row.patient_id,
    p.clinicId,
  ]);
  const chatId = String((chatR.rows[0] as { chat_id?: string } | undefined)?.chat_id || "").trim();
  if (chatId) {
    const existing = await pool.query(
      `SELECT id FROM core_outbox
       WHERE job_type = 'whatsapp_send' AND status IN ('pending', 'failed', 'processing')
         AND payload->>'dedupe' = $1
       LIMIT 1`,
      [`late_check:${p.appointmentId}`],
    );
    if (!existing.rows[0]) {
      const recent = await isPatientRecentlyActive(pool, { clinicId: p.clinicId, patientId: row.patient_id });
      if (recent) {
        const openConvId = await resolveOpenConversationId(pool, p.clinicId, row.patient_id);
        await enqueueCoreOutbox(pool, {
          clinic_id: p.clinicId,
          conversation_id: openConvId,
          job_type: "whatsapp_send",
          payload: {
            to: chatId,
            text: body,
            kind: "late_check",
            dedupe: `late_check:${p.appointmentId}`,
            patient_id: row.patient_id,
          },
        });
      }
    }
  }
  return { ok: true };
}
