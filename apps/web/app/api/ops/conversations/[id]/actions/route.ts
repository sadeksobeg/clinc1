import { NextResponse } from "next/server";
import { patchConversation } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const conversationId = Number(ctx.params.id);
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const out = await patchConversation({
    conversation_id: conversationId,
    clinic_id: user.clinic_id,
    mark_unread: typeof (body as { mark_unread?: unknown }).mark_unread === "boolean" ? (body as { mark_unread: boolean }).mark_unread : undefined,
    assign_doctor_id:
      typeof (body as { assign_doctor_id?: unknown }).assign_doctor_id === "number"
        ? (body as { assign_doctor_id: number }).assign_doctor_id
        : undefined,
    archive: typeof (body as { archive?: unknown }).archive === "boolean" ? (body as { archive: boolean }).archive : undefined,
    state: typeof (body as { state?: unknown }).state === "string" ? (body as { state: string }).state : undefined,
    idempotency_key:
      typeof (body as { idempotency_key?: unknown }).idempotency_key === "string"
        ? (body as { idempotency_key: string }).idempotency_key
        : undefined,
  });

  return NextResponse.json(out, { status: out.ok ? 200 : 400 });
}
