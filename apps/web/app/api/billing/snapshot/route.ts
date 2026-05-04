import { NextResponse } from "next/server";
import { fetchSubscriptionPricing, fetchTenantCurrent, fetchTenantInvoices, fetchTenantSubscription, fetchTenantUsage } from "@/lib/dotnet-server";
import { fetchDoctorsRows } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const [pricing, doctors, tenantCurrent, tenantSub, tenantUsage, tenantInvoices] = await Promise.all([
    fetchSubscriptionPricing(),
    fetchDoctorsRows(user.clinic_id),
    fetchTenantCurrent(),
    fetchTenantSubscription(),
    fetchTenantUsage(),
    fetchTenantInvoices(),
  ]);

  const doctorCount = doctors.ok ? (doctors.rows ?? []).filter((d) => d.is_active).length : 0;
  const basePrice = 120;
  const includedDoctors = 1;
  const extraDoctorPrice = 30;
  const extraDoctors = Math.max(0, doctorCount - includedDoctors);
  const estimatedMonthlyTotal = basePrice + extraDoctors * extraDoctorPrice;

  return NextResponse.json({
    ok: true,
    billing: {
      doctor_count: doctorCount,
      included_doctors: includedDoctors,
      extra_doctors: extraDoctors,
      base_price_usd: basePrice,
      extra_doctor_price_usd: extraDoctorPrice,
      estimated_monthly_total_usd: estimatedMonthlyTotal,
      pricing,
      tenant_current: tenantCurrent,
      tenant_subscription: tenantSub,
      tenant_usage: tenantUsage,
      tenant_invoices: tenantInvoices,
    },
  });
}
