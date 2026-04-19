import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { opsLogError } from "@/lib/opsLog";
import { requireDoctorSession } from "@/lib/staffAuth";

const bodySchema = z.object({
  appointment_id: z.number().int().positive(),
  action: z.enum(["check_in", "done", "skip"]),
});

export async function POST(req: Request) {
  const gate = await requireDoctorSession();
  if (!gate.ok) return gate.response;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
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
      return NextResponse.json({ ok: false, error: "No doctor profile linked" }, { status: 400 });
    }
    const ap = await pool.query(
      `SELECT id FROM appointments WHERE id = $1 AND clinic_id = $2 AND doctor_id = $3 AND deleted_at IS NULL`,
      [parsed.data.appointment_id, clinicId, doctorId],
    );
    if (!ap.rows[0]) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (parsed.data.action === "check_in") {
      await pool.query(
        `UPDATE appointments SET patient_arrival_state = 'checked_in', updated_at = NOW() WHERE id = $1`,
        [parsed.data.appointment_id],
      );
    } else if (parsed.data.action === "done") {
      await pool.query(
        `UPDATE appointments SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [parsed.data.appointment_id],
      );
    } else if (parsed.data.action === "skip") {
      await pool.query(
        `UPDATE appointments SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [parsed.data.appointment_id],
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    opsLogError("doctor/action", e, { clinicId, appointment_id: parsed.data.appointment_id, action: parsed.data.action });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
