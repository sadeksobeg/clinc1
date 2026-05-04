import { NextResponse } from "next/server";
import { proxyConversationReply } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

type Ctx = { params: { id: string } };

export async function POST(req: Request, ctx: Ctx) {
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

  const text = typeof (body as { text?: unknown }).text === "string" ? (body as { text: string }).text.trim() : "";
  const idempotencyKey =
    typeof (body as { idempotency_key?: unknown }).idempotency_key === "string"
      ? (body as { idempotency_key: string }).idempotency_key
      : undefined;

  if (!text) return NextResponse.json({ ok: false, error: "text_required" }, { status: 400 });

  const res = await proxyConversationReply(conversationId, { clinic_id: user.clinic_id, text, idempotency_key: idempotencyKey });
  const json = await res.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: res.status });
}
