import { NextResponse } from "next/server";
import { fetchBillingAdminInvoices } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "all";
  const limit = Number(url.searchParams.get("limit") || "200");
  try {
    const result = await fetchBillingAdminInvoices({ status, limit });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "billing_admin_invoices_unavailable" },
      { status: 502 },
    );
  }
}
