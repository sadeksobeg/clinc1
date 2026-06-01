import { NextResponse } from "next/server";
import { fetchOpsClinicBillingSnapshot } from "@/lib/ops-billing";
import { requireUserWithClinic } from "@/lib/secure-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;

  const r = await fetchOpsClinicBillingSnapshot(user.clinic_id);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error || "unavailable" }, { status: 503 });
  }

  const snap = r.snapshot as Record<string, unknown> | undefined;
  return NextResponse.json({
    ok: true,
    billing: {
      doctor_count: snap?.doctor_count ?? 0,
      included_doctors: snap?.included_doctors ?? 1,
      extra_doctors: snap?.extra_doctors ?? 0,
      base_price_usd: snap?.base_price_usd ?? 120,
      extra_doctor_price_usd: snap?.extra_doctor_price_usd ?? 30,
      estimated_monthly_total_usd: snap?.estimated_total_usd ?? 120,
      subscription: snap,
      invoices: r.invoices ?? [],
      source: "ops_local_billing",
    },
  });
}
