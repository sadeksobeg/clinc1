import { NextResponse } from "next/server";
import { fetchOpsPricing } from "@/lib/ops-billing";

/** BFF: public pricing from ops local billing (primary). */
export async function GET() {
  const r = await fetchOpsPricing();
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error || "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, pricing: r.pricing });
}
