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
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const startsAt = typeof (body as { starts_at?: unknown }).starts_at === "string" ? (body as { starts_at: string }).starts_at : undefined;
  const endsAt = typeof (body as { ends_at?: unknown }).ends_at === "string" ? (body as { ends_at: string }).ends_at : undefined;
  const idempotencyKey =
    typeof (body as { idempotency_key?: unknown }).idempotency_key === "string"
      ? (body as { idempotency_key: string }).idempotency_key
      : undefined;

  if (!startsAt || !endsAt) {
    return NextResponse.json({ ok: false, error: "starts_ends_required" }, { status: 400 });
  }

  const res = await proxyAppointmentPatch(appointmentId, {
    clinic_id: user.clinic_id,
    starts_at: startsAt,
    ends_at: endsAt,
    idempotency_key: idempotencyKey,
  });
  const json = await res.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: res.status });
}
