import { NextResponse } from "next/server";
import { runAiCalibrationAction } from "@/lib/ops-server";
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

  const action = String((body as { action?: string }).action ?? "suggest");
  const actor_user_id =
    typeof (body as { actor_user_id?: unknown }).actor_user_id === "string"
      ? (body as { actor_user_id: string }).actor_user_id
      : undefined;
  if (action !== "suggest" && action !== "apply" && action !== "reject") {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }

  const out = await runAiCalibrationAction({
    clinic_id: user.clinic_id,
    action: action as "suggest" | "apply" | "reject",
    actor_user_id,
  });
  return NextResponse.json(out, { status: out.ok ? 200 : 400 });
}
