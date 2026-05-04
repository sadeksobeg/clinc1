import { NextResponse } from "next/server";
import { createAppointment } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export async function POST(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const out = await createAppointment({
    clinic_id: user.clinic_id,
    patient_id: Number((body as { patient_id?: number }).patient_id ?? 0),
    doctor_id: Number((body as { doctor_id?: number }).doctor_id ?? 0),
    starts_at: String((body as { starts_at?: string }).starts_at ?? ""),
    conversation_id:
      typeof (body as { conversation_id?: unknown }).conversation_id === "number"
        ? (body as { conversation_id: number }).conversation_id
        : undefined,
    idempotency_key: typeof (body as { idempotency_key?: unknown }).idempotency_key === "string" ? (body as { idempotency_key: string }).idempotency_key : undefined,
  });

  return NextResponse.json(out, { status: out.ok ? 200 : 400 });
}
