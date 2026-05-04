import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { opsLogError } from "@/lib/opsLog";
import { requireSecretarySession } from "@/lib/staffAuth";
import { confirmAppointment } from "@/lib/scheduling/appointmentService";

const bodySchema = z.object({
  patient_id: z.number().int().positive(),
  doctor_id: z.number().int().positive(),
  starts_at: z.string().min(10),
  conversation_id: z.number().int().positive().optional().nullable(),
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
  try {
    const pool = getPool();
    const res = await confirmAppointment(pool, {
      clinicId,
      patientId: parsed.data.patient_id,
      doctorId: parsed.data.doctor_id,
      startsAtIso: parsed.data.starts_at,
      conversationId: parsed.data.conversation_id ?? undefined,
      staffUserId: staffId,
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
            manual_override_by: `staff:${staffId}`,
            suggested_actions: [],
          }),
          parsed.data.conversation_id,
          clinicId,
        ],
      );
    }
    return NextResponse.json({ ok: true, appointment_id: res.appointment_id });
  } catch (e) {
    opsLogError("secretary/manual", e, { clinicId, staffId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
