import { NextResponse } from "next/server";
import { fetchBillingAdminRequests } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";
  const limit = Number(url.searchParams.get("limit") || "100");
  try {
    const result = await fetchBillingAdminRequests({ status, limit });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "billing_requests_unavailable" },
      { status: 502 },
    );
  }
}
