import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireSecretarySession } from "@/lib/staffAuth";

export const dynamic = "force-dynamic";

/** Recent open WhatsApp conversations with last message + dialogue step (Core V2). */
export async function GET() {
  const gate = await requireSecretarySession();
  if (!gate.ok) return gate.response;
  const clinicId = Number(gate.session.clinicId);
  const pool = getPool();
  const r = await pool.query(
    `SELECT c.id AS conversation_id, c.state, c.dialogue_state, c.dialogue_version, c.updated_at,
            p.chat_id, p.display_name AS patient_name,
            lm.text AS last_message_text, lm.direction AS last_message_direction, lm.created_at AS last_message_at
     FROM conversations c
     JOIN patients p ON p.id = c.patient_id AND p.clinic_id = c.clinic_id
     LEFT JOIN LATERAL (
       SELECT m.text, m.direction, m.created_at
       FROM messages m
       WHERE m.conversation_id = c.id AND m.clinic_id = c.clinic_id
       ORDER BY m.id DESC
       LIMIT 1
     ) lm ON TRUE
     WHERE c.clinic_id = $1 AND c.status = 'open' AND c.deleted_at IS NULL
     ORDER BY COALESCE(lm.created_at, c.updated_at) DESC NULLS LAST
     LIMIT 40`,
    [clinicId],
  );
  return NextResponse.json({ ok: true, rows: r.rows });
}
