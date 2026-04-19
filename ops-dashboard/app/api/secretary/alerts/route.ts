import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireSecretarySession } from "@/lib/staffAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSecretarySession();
  if (!gate.ok) return gate.response;
  const clinicId = Number(gate.session.clinicId);
  const pool = getPool();
  const r = await pool.query(
    `SELECT a.id, a.alert_type, a.target, a.status, a.notes, a.created_at,
            c.id AS conversation_id, p.chat_id, p.display_name AS patient_name
     FROM alerts a
     JOIN conversations c ON c.id = a.conversation_id AND c.clinic_id = a.clinic_id
     JOIN patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
     WHERE a.clinic_id = $1 AND a.status IN ('queued', 'failed')
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [clinicId],
  );
  return NextResponse.json({ ok: true, alerts: r.rows });
}
