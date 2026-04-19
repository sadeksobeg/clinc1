import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { resolveOpenConversationId } from "@/lib/conversations/pendingCoalesce";
import { enqueueCoreOutbox } from "@/lib/outbox/coreOutbox";
import { isPatientRecentlyActive } from "@/lib/whatsapp/replyWindow";
import { opsLogError } from "@/lib/opsLog";
import { loadDueReminders, markReminderSent } from "@/lib/scheduling/reminderActions";

const bodySchema = z.object({
  clinic_id: z.number().int().positive().optional(),
  /** Legacy: mark reminder_sent without sending (tests / manual). */
  mark_sent: z.boolean().optional(),
  /** When true (default), enqueue `core_outbox` whatsapp_send; mark `reminder_sent_at` after successful send via outbox-drain. */
  enqueue_outbox: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  let json: unknown = {};
  try {
    if (req.headers.get("content-length") !== "0") json = await req.json();
  } catch {
    json = {};
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  try {
    const pool = getPool();
    const rows = await loadDueReminders(pool, parsed.data.clinic_id);
    let enqueued = 0;
    if (parsed.data.enqueue_outbox) {
      for (const row of rows) {
        const to = String(row.chat_id || "").trim();
        if (!to) continue;
        const dedupe = `reminder:${row.appointment_id}`;
        const dup = await pool.query(
          `SELECT id FROM core_outbox
           WHERE job_type = 'whatsapp_send' AND status IN ('pending', 'failed', 'processing')
             AND payload->>'dedupe' = $1
           LIMIT 1`,
          [dedupe],
        );
        if (dup.rows[0]) continue;
        const recent = await isPatientRecentlyActive(pool, { clinicId: row.clinic_id, patientId: row.patient_id });
        if (!recent) continue;
        const openConvId = await resolveOpenConversationId(pool, row.clinic_id, row.patient_id);
        await enqueueCoreOutbox(pool, {
          clinic_id: row.clinic_id,
          conversation_id: openConvId,
          job_type: "whatsapp_send",
          payload: {
            to,
            text: row.body_ar,
            kind: "reminder",
            dedupe,
            mark_reminder_after_send: row.appointment_id,
            patient_id: row.patient_id,
          },
        });
        enqueued += 1;
      }
    }
    if (parsed.data.mark_sent && !parsed.data.enqueue_outbox) {
      for (const row of rows) {
        await markReminderSent(pool, row.appointment_id);
      }
    }
    return NextResponse.json({ ok: true, reminders: rows, count: rows.length, enqueued });
  } catch (e) {
    opsLogError("internal/scheduling/reminders/due", e, { clinic_id: parsed.data.clinic_id });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
