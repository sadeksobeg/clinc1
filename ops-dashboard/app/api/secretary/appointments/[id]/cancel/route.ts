import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { opsLogError } from "@/lib/opsLog";
import { staffCancelAppointment } from "@/lib/scheduling/appointmentService";
import { requireSecretarySession } from "@/lib/staffAuth";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function POST(_req: Request, ctx: Ctx) {
  const gate = await requireSecretarySession();
  if (!gate.ok) return gate.response;
  const clinicId = Number(gate.session.clinicId);
  const staffId = Number(gate.session.sub);
  const { id } = ctx.params;
  const appointmentId = Number(id);
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }
  try {
    const pool = getPool();
    const res = await staffCancelAppointment(pool, { appointmentId, clinicId });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "not_found", code: res.code }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    opsLogError("secretary/appointments/cancel", e, { clinicId, staffId, appointmentId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
