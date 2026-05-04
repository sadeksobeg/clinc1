import { NextResponse } from "next/server";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { listTrialFunnelEventsSince } from "@/lib/analytics/trialFunnelStore";

export async function GET(req: Request) {
  const authErr = assertSchedulingServiceToken(req);
  if (authErr) return authErr;
  const url = new URL(req.url);
  const sinceMsRaw = Number(url.searchParams.get("since_ms") || 0);
  const untilMsRaw = Number(url.searchParams.get("until_ms") || 0);
  const sinceMs = Number.isFinite(sinceMsRaw) && sinceMsRaw > 0 ? sinceMsRaw : Date.now() - 24 * 60 * 60 * 1000;
  const untilMs = Number.isFinite(untilMsRaw) && untilMsRaw > sinceMs ? untilMsRaw : undefined;
  const cohortKey = url.searchParams.get("cohort_key") || undefined;
  const experimentId = url.searchParams.get("experiment_id") || undefined;
  const variantId = url.searchParams.get("variant_id") || undefined;
  const utmSource = url.searchParams.get("utm_source") || undefined;
  const events = await listTrialFunnelEventsSince(sinceMs, {
    untilMs,
    cohortKey,
    experimentId,
    variantId,
    utmSource,
  });
  return NextResponse.json({ ok: true, events });
}
