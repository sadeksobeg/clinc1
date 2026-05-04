import { NextResponse } from "next/server";
import { fetchDoctorSlots } from "@/lib/ops-server";
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

  const out = await fetchDoctorSlots({
    clinic_id: user.clinic_id,
    doctor_id: typeof (body as { doctor_id?: unknown }).doctor_id === "number" ? (body as { doctor_id: number }).doctor_id : undefined,
    specialty: typeof (body as { specialty?: unknown }).specialty === "string" ? (body as { specialty: string }).specialty : undefined,
    conversation_id:
      typeof (body as { conversation_id?: unknown }).conversation_id === "number"
        ? (body as { conversation_id: number }).conversation_id
        : undefined,
    limit: typeof (body as { limit?: unknown }).limit === "number" ? (body as { limit: number }).limit : undefined,
    day_key: typeof (body as { day_key?: unknown }).day_key === "string" ? (body as { day_key: string }).day_key : undefined,
  });

  return NextResponse.json(out, { status: out.ok ? 200 : 400 });
}
