import { NextResponse } from "next/server";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { getProductMetricsSnapshot } from "@/lib/observability/productMetrics";
import { getWaPolicyMetrics } from "@/lib/whatsapp/globalReplyPolicy";

/**
 * In-process counters (Bearer SCHEDULING_SERVICE_TOKEN). For operators / sidecars until Prometheus is wired here.
 */
export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  return NextResponse.json({
    ok: true,
    product: getProductMetricsSnapshot(),
    whatsapp_policy: getWaPolicyMetrics(),
  });
}
