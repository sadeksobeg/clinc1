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
    `SELECT id, display_name, specialty, slot_duration_minutes
     FROM doctors WHERE clinic_id = $1 AND is_active = TRUE AND deleted_at IS NULL
     ORDER BY id ASC`,
    [clinicId],
  );
  return NextResponse.json({ ok: true, doctors: r.rows });
}
