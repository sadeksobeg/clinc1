import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { opsLogError } from "@/lib/opsLog";
import { staffRescheduleAppointment } from "@/lib/scheduling/appointmentService";
import { requireSecretarySession } from "@/lib/staffAuth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  starts_at: z.string().min(10),
});

type Ctx = { params: { id: string } };

export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireSecretarySession();
  if (!gate.ok) return gate.response;
  const clinicId = Number(gate.session.clinicId);
  const staffId = Number(gate.session.sub);
  const { id } = ctx.params;
  const appointmentId = Number(id);
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }
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
  try {
    const pool = getPool();
    const res = await staffRescheduleAppointment(pool, {
      appointmentId,
      clinicId,
      startsAtIso: parsed.data.starts_at,
    });
    if (!res.ok) {
      const status = res.code === "overlap" ? 409 : res.code === "invalid" ? 400 : 404;
      return NextResponse.json({ ok: false, error: res.code, code: res.code }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    opsLogError("secretary/appointments/reschedule", e, { clinicId, staffId, appointmentId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
