import { NextResponse } from "next/server";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

/** Public pricing grid for marketing / apps/web (ops local billing defaults). */
export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  return NextResponse.json({
    ok: true,
    pricing: {
      currency: "USD",
      base_monthly_usd: 120,
      included_doctors: 1,
      extra_doctor_monthly_usd: 30,
      trial_days: 3,
      plans: [
        {
          code: "clinic_standard",
          name_ar: "العيادة القياسية",
          name_en: "Clinic Standard",
          base_monthly_usd: 120,
          included_doctors: 1,
          extra_doctor_monthly_usd: 30,
        },
      ],
      source: "ops_local_billing",
    },
  });
}
