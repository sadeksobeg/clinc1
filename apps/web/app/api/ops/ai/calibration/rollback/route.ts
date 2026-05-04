import { NextResponse } from "next/server";
import { runAiCalibrationRollback } from "@/lib/ops-server";
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

  const actor_user_id =
    typeof (body as { actor_user_id?: unknown }).actor_user_id === "string"
      ? (body as { actor_user_id: string }).actor_user_id
      : undefined;
  const out = await runAiCalibrationRollback({ clinic_id: user.clinic_id, actor_user_id });
  return NextResponse.json(out, { status: out.ok ? 200 : 400 });
}
