import { NextResponse } from "next/server";
import { fetchSubscriptionPricing } from "@/lib/dotnet-server";

/** BFF: forwards public pricing from .NET (no secrets). */
export async function GET() {
  const r = await fetchSubscriptionPricing();
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error || "unavailable" }, { status: r.error === "DOTNET_API_URL is not set" ? 503 : 502 });
  }
  return NextResponse.json({ ok: true, pricing: r.data });
}
