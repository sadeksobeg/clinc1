import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { doctorOutShiftRemaining } from "@/lib/scheduling/doctorOutActions";

const bodySchema = z.object({
  clinic_id: z.number().int().positive(),
  doctor_id: z.number().int().positive(),
  shift_minutes: z.number().int().min(5).max(180).optional(),
  actor_staff_id: z.number().int().positive().optional().nullable(),
});

export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
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
  const pool = getPool();
  const { shifted } = await doctorOutShiftRemaining(pool, {
    clinicId: parsed.data.clinic_id,
    doctorId: parsed.data.doctor_id,
    shiftMinutes: parsed.data.shift_minutes ?? 20,
    actorStaffId: parsed.data.actor_staff_id ?? undefined,
  });
  return NextResponse.json({ ok: true, shifted });
}
