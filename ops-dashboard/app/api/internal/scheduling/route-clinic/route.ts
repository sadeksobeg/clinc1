import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { setConversationSelectedClinic } from "@/lib/scheduling/routingActions";

const bodySchema = z.object({
  conversation_id: z.number().int().positive(),
  clinic_id: z.number().int().positive(),
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
  const pool = getPool();
  await setConversationSelectedClinic(pool, parsed.data.conversation_id, parsed.data.clinic_id);
  return NextResponse.json({ ok: true });
}
