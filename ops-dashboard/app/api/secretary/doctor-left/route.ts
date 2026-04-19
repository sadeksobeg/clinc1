import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { isDemoMode } from "@/lib/demoMode";
import { opsLog, opsLogError } from "@/lib/opsLog";
import { requireSecretarySession } from "@/lib/staffAuth";
import { doctorOutShiftRemaining } from "@/lib/scheduling/doctorOutActions";

const bodySchema = z.object({
  doctor_id: z.number().int().positive(),
  shift_minutes: z.number().int().min(5).max(180).optional(),
});

export async function POST(req: Request) {
  const gate = await requireSecretarySession();
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
  if (isDemoMode()) {
    opsLog("info", "secretary/doctor-left", "demo_mode_skip", { clinicId, doctor_id: parsed.data.doctor_id });
    return NextResponse.json({
      ok: true,
      shifted: 0,
      demo_simulated: true,
      message_ar: "وضع العرض التوضيحي: لم تُنفَّذ إزاحة فعلية على قاعدة البيانات.",
    });
  }
  try {
    const pool = getPool();
    const { shifted } = await doctorOutShiftRemaining(pool, {
      clinicId,
      doctorId: parsed.data.doctor_id,
      shiftMinutes: parsed.data.shift_minutes ?? 20,
      actorStaffId: staffId,
    });
    return NextResponse.json({ ok: true, shifted });
  } catch (e) {
    opsLogError("secretary/doctor-left", e, { clinicId, doctor_id: parsed.data.doctor_id });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
