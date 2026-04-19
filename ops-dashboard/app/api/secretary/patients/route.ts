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
    `SELECT id, display_name, chat_id FROM patients
     WHERE clinic_id = $1 AND deleted_at IS NULL
     ORDER BY last_seen_at DESC NULLS LAST
     LIMIT 80`,
    [clinicId],
  );
  return NextResponse.json({ ok: true, patients: r.rows });
}
