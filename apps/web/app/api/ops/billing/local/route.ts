import { NextResponse } from "next/server";
import { createLocalPaymentRequest, fetchLocalBillingSnapshot } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  try {
    const result = await fetchLocalBillingSnapshot(user.clinic_id);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "billing_snapshot_unavailable" },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  function isValidHttpUrl(raw: string): boolean {
    const s = String(raw || "").trim();
    if (!s) return false;
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }
  const paymentMethodRaw =
    typeof (body as { payment_method?: unknown }).payment_method === "string"
      ? (body as { payment_method: string }).payment_method
      : "cash";
  const payment_method =
    paymentMethodRaw === "cash" || paymentMethodRaw === "shamcash" || paymentMethodRaw === "manual_transfer"
      ? paymentMethodRaw
      : "cash";
  const amount_usd = Number((body as { amount_usd?: unknown }).amount_usd || 0);
  const receipt_url =
    typeof (body as { receipt_url?: unknown }).receipt_url === "string"
      ? (body as { receipt_url: string }).receipt_url
      : undefined;
  const reference_code =
    typeof (body as { reference_code?: unknown }).reference_code === "string"
      ? (body as { reference_code: string }).reference_code
      : undefined;
  const note = typeof (body as { note?: unknown }).note === "string" ? (body as { note: string }).note : undefined;
  const requested_by =
    typeof (body as { requested_by?: unknown }).requested_by === "string"
      ? (body as { requested_by: string }).requested_by
      : undefined;
  const request_type =
    typeof (body as { request_type?: unknown }).request_type === "string"
      ? ((body as { request_type: "activation" | "renewal" }).request_type as "activation" | "renewal")
      : undefined;
  const idempotency_key =
    typeof (body as { idempotency_key?: unknown }).idempotency_key === "string"
      ? (body as { idempotency_key: string }).idempotency_key
      : undefined;

  if ((payment_method === "shamcash" || payment_method === "manual_transfer") && receipt_url && !isValidHttpUrl(receipt_url)) {
    return NextResponse.json({ ok: false, error: "invalid_receipt_url" }, { status: 400 });
  }

  try {
    const result = await createLocalPaymentRequest(user.clinic_id, {
      payment_method,
      amount_usd,
      receipt_url,
      reference_code,
      note,
      requested_by,
      request_type,
      idempotency_key,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "billing_payment_request_unavailable" },
      { status: 502 },
    );
  }
}
