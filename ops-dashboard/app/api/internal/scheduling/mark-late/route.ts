import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { markAppointmentLate } from "@/lib/scheduling/delayActions";

const bodySchema = z.object({
  clinic_id: z.number().int().positive(),
  appointment_id: z.number().int().positive(),
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
  const r = await markAppointmentLate(pool, {
    appointmentId: parsed.data.appointment_id,
    clinicId: parsed.data.clinic_id,
  });
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
