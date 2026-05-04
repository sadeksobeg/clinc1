import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { writeStructuredLog } from "@/lib/observability/trace";

const schema = z.object({
  event: z.literal("platform.context.changed"),
  actor_user_id: z.string().min(1),
  actor_scope: z.literal("platform"),
  target_clinic_id: z.number().int().positive().nullable(),
  action: z.enum(["set", "clear"]),
});

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const requestId = req.headers.get("x-request-id")?.trim() || null;
  const payload = parsed.data;
  await writeStructuredLog({
    level: "info",
    eventName: payload.event,
    requestId,
    clinicId: payload.target_clinic_id,
    userId: Number(payload.actor_user_id) || null,
    message: "Platform acting clinic context changed",
    payload,
  });
  return NextResponse.json({ ok: true });
}
