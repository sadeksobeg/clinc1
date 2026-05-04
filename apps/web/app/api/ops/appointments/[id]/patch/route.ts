import { NextResponse } from "next/server";
import { z } from "zod";
import { proxyAppointmentPatch } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

type Ctx = { params: { id: string } };

const schema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled", "no_show", "completed"]).optional(),
  patient_arrival_state: z.enum(["expected", "late", "checked_in", "no_show"]).optional(),
  idempotency_key: z.string().max(200).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const appointmentId = Number(ctx.params.id);
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const res = await proxyAppointmentPatch(appointmentId, {
    clinic_id: user.clinic_id,
    status: parsed.data.status,
    patient_arrival_state: parsed.data.patient_arrival_state,
    idempotency_key: parsed.data.idempotency_key,
  });
  const json = await res.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: res.status });
}

