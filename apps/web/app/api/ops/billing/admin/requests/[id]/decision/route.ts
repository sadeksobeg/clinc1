import { NextResponse } from "next/server";
import { reviewBillingRequest } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const requestId = Number(ctx.params.id);
  if (!Number.isFinite(requestId) || requestId <= 0) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const decisionRaw =
    typeof (body as { decision?: unknown }).decision === "string" ? (body as { decision: string }).decision : "reject";
  const decision = decisionRaw === "approve" || decisionRaw === "reject" ? decisionRaw : "reject";
  const reviewer =
    typeof (body as { reviewer?: unknown }).reviewer === "string"
      ? (body as { reviewer: string }).reviewer
      : undefined;
  const review_note =
    typeof (body as { review_note?: unknown }).review_note === "string"
      ? (body as { review_note: string }).review_note
      : undefined;
  const idempotency_key =
    typeof (body as { idempotency_key?: unknown }).idempotency_key === "string"
      ? (body as { idempotency_key: string }).idempotency_key
      : undefined;
  const billing_confirm = (body as { billing_confirm?: unknown }).billing_confirm === true;
  const billing_confirm_phrase =
    typeof (body as { billing_confirm_phrase?: unknown }).billing_confirm_phrase === "string"
      ? (body as { billing_confirm_phrase: string }).billing_confirm_phrase
      : undefined;

  try {
    const result = await reviewBillingRequest(requestId, {
      decision,
      reviewer,
      review_note,
      idempotency_key,
      billing_confirm,
      billing_confirm_phrase,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "billing_review_unavailable" },
      { status: 502 },
    );
  }
}
