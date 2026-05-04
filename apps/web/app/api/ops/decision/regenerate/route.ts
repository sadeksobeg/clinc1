import { NextResponse } from "next/server";
import { regenerateDecisionSuggestion } from "@/lib/ops-server";
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

  const payload = {
    clinic_id: user.clinic_id,
    conversation_id: Number((body as { conversation_id?: number }).conversation_id ?? 0),
  };
  if (!Number.isFinite(payload.clinic_id) || payload.clinic_id < 1) {
    return NextResponse.json({ ok: false, error: "bad_clinic_id" }, { status: 400 });
  }
  if (!Number.isFinite(payload.conversation_id) || payload.conversation_id < 1) {
    return NextResponse.json({ ok: false, error: "bad_conversation_id" }, { status: 400 });
  }

  const out = await regenerateDecisionSuggestion(payload);
  return NextResponse.json(out, { status: out.ok ? 200 : out.error === "no_available_slots" ? 409 : 400 });
}
