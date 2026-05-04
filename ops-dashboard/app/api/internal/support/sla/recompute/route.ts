import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const clinicId = Number(req.headers.get("x-clinic-id") || 0);
  const pool = getPool();
  const scope = clinicId > 0 ? "AND clinic_id = $1" : "";
  const params: unknown[] = clinicId > 0 ? [clinicId] : [];
  const r = await pool.query(
    `UPDATE support_tickets
     SET support_breach_flag = (
       status IN ('open', 'assigned', 'escalated')
       AND support_sla_deadline IS NOT NULL
       AND support_sla_deadline < NOW()
     ),
     updated_at = NOW()
     WHERE 1=1 ${scope}`,
    params,
  );
  return NextResponse.json({ ok: true, updated: r.rowCount || 0 });
}
