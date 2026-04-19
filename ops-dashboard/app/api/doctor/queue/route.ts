import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getPool } from "@/lib/db";
import { opsLogError } from "@/lib/opsLog";
import { requireDoctorSession } from "@/lib/staffAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireDoctorSession();
  if (!gate.ok) return gate.response;
  const clinicId = Number(gate.session.clinicId);
  const staffId = Number(gate.session.sub);
  try {
    const pool = getPool();
    const dr = await pool.query(
      `SELECT id FROM doctors WHERE clinic_id = $1 AND staff_user_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [clinicId, staffId],
    );
    const doctorId = dr.rows[0]?.id as number | undefined;
    if (!doctorId) {
      return NextResponse.json({ ok: true, doctor_id: null, appointments: [] });
    }
    const tzr = await pool.query(`SELECT timezone FROM clinics WHERE id = $1`, [clinicId]);
    const zone = (tzr.rows[0]?.timezone as string) || "Asia/Amman";
    const start = DateTime.now().setZone(zone).startOf("day").toUTC().toISO()!;
    const end = DateTime.now().setZone(zone).endOf("day").toUTC().toISO()!;
    const r = await pool.query(
      `SELECT a.id, a.starts_at, a.ends_at, a.status, a.patient_arrival_state, a.sequence_no,
            p.display_name AS patient_name, p.chat_id
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
     WHERE a.clinic_id = $1 AND a.doctor_id = $2 AND a.deleted_at IS NULL
       AND a.starts_at >= $3::timestamptz AND a.starts_at <= $4::timestamptz
       AND a.status NOT IN ('cancelled')
     ORDER BY a.starts_at ASC`,
      [clinicId, doctorId, start, end],
    );
    return NextResponse.json({ ok: true, doctor_id: doctorId, appointments: r.rows, timezone: zone });
  } catch (e) {
    opsLogError("doctor/queue", e, { clinicId, staffId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
