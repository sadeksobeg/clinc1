import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";

export const dynamic = "force-dynamic";

/** Upcoming appointments for calendar-style UIs (service token). */
export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const url = new URL(req.url);
  const clinicId = Math.max(1, Number.parseInt(url.searchParams.get("clinic_id") || "1", 10) || 1);
  const days = Math.min(60, Math.max(1, Number.parseInt(url.searchParams.get("days") || "14", 10) || 14));
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT a.id, a.starts_at, a.ends_at, a.status, a.patient_id, a.doctor_id, a.notes, a.source_channel,
              p.display_name AS patient_display_name,
              d.display_name AS doctor_name
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       LEFT JOIN doctors d ON d.id = a.doctor_id
       WHERE a.clinic_id = $1 AND a.deleted_at IS NULL
         AND a.starts_at >= NOW() - interval '1 hour'
         AND a.starts_at < NOW() + ($2::int * interval '1 day')
         AND a.status NOT IN ('cancelled', 'no_show')
       ORDER BY a.starts_at ASC
       LIMIT 500`,
      [clinicId, days],
    );
    return NextResponse.json({ ok: true, rows: r.rows, days });
  } catch (e) {
    opsLogError("internal/appointments/upcoming", e, { clinic_id: clinicId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
