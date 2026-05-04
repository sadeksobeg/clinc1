import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { confirmAppointment } from "@/lib/scheduling/appointmentService";

const bodySchema = z.object({
  clinic_id: z.number().int().positive(),
  patient_id: z.number().int().positive(),
  doctor_id: z.number().int().positive(),
  starts_at: z.string().min(10),
  staff_user_id: z.number().int().positive(),
  conversation_id: z.number().int().positive().optional().nullable(),
  idempotency_key: z.string().max(200).optional().nullable(),
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
  const res = await confirmAppointment(pool, {
    clinicId: parsed.data.clinic_id,
    patientId: parsed.data.patient_id,
    doctorId: parsed.data.doctor_id,
    startsAtIso: parsed.data.starts_at,
    conversationId: parsed.data.conversation_id ?? undefined,
    staffUserId: parsed.data.staff_user_id,
    idempotencyKey: parsed.data.idempotency_key ?? undefined,
    sourceChannel: "ops_manual",
  });
  if (!res.ok) {
    const code = res.code === "overlap" ? 409 : 400;
    return NextResponse.json({ ok: false, error: res.error, code: res.code }, { status: code });
  }
  if (parsed.data.conversation_id) {
    await pool.query(
      `UPDATE conversations
       SET routing = COALESCE(routing, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3`,
      [
        JSON.stringify({
          manual_override_at: new Date().toISOString(),
          manual_override_by: `staff:${parsed.data.staff_user_id}`,
          suggested_actions: [],
        }),
        parsed.data.conversation_id,
        parsed.data.clinic_id,
      ],
    );
  }
  return NextResponse.json({ ok: true, appointment_id: res.appointment_id, duplicate: res.duplicate ?? false });
}
