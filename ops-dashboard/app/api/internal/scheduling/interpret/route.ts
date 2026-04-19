import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";
import { interpretInboundText } from "@/lib/scheduling/interpret";
import { getConversationRouting, listClinics } from "@/lib/scheduling/routingActions";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  conversation_id: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
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
    const result = await interpretInboundText(parsed.data.text);
    let needs_clinic_pick = false;
    let clinics: { id: number; name: string; slug: string }[] | undefined;
    if (parsed.data.conversation_id && result.intent === "booking") {
      const pool = getPool();
      const routing = await getConversationRouting(pool, parsed.data.conversation_id);
      const selected = routing.selected_clinic_id as number | undefined;
      const all = await listClinics(pool);
      if (all.length > 1 && selected == null) {
        needs_clinic_pick = true;
        clinics = all;
      }
    }
    return NextResponse.json({ ok: true, interpret: result, needs_clinic_pick, clinics });
  } catch (e) {
    opsLogError("internal/scheduling/interpret", e, {});
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
