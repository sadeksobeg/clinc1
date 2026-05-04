import { NextResponse } from "next/server";
import { proxyAppointmentPatch } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

type Ctx = { params: { id: string } };

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
  const idempotencyKey =
    typeof (body as { idempotency_key?: unknown }).idempotency_key === "string"
      ? (body as { idempotency_key: string }).idempotency_key
      : undefined;

  const res = await proxyAppointmentPatch(appointmentId, {
    clinic_id: user.clinic_id,
    status: "cancelled",
    idempotency_key: idempotencyKey,
  });
  const json = await res.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: res.status });
}
