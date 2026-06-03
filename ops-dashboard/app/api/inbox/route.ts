import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {
  conversationVisibleToClinicSql,
  ROUTED_CLINIC_ID_SELECT_SQL,
} from "@/lib/conversations/clinicVisibility";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.sub || session.clinicId == null) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const clinicId = Number(session.clinicId);
  const pool = getPool();
  const visibleSql = conversationVisibleToClinicSql("$1");
  const r = await pool.query(
    `SELECT c.id AS conversation_id,
            c.clinic_id AS owner_clinic_id,
            ${ROUTED_CLINIC_ID_SELECT_SQL},
            c.state,
            c.handoff_reason,
            c.status,
            p.id AS patient_id,
            p.chat_id,
            p.display_name,
            p.is_vip,
            p.is_blacklisted,
            lm.text AS last_message,
            lm.created_at AS last_message_at
     FROM conversations c
     JOIN patients p ON p.id = c.patient_id
     LEFT JOIN LATERAL (
       SELECT m.text, m.created_at
       FROM messages m
       WHERE m.conversation_id = c.id AND m.clinic_id = c.clinic_id
       ORDER BY m.created_at DESC
       LIMIT 1
     ) lm ON TRUE
     WHERE ${visibleSql}
       AND c.deleted_at IS NULL
       AND c.status = 'open'
     ORDER BY lm.created_at DESC NULLS LAST, c.updated_at DESC
     LIMIT 200`,
    [clinicId],
  );

  return NextResponse.json({ ok: true, rows: r.rows });
}
