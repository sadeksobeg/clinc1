import { NextResponse } from "next/server";
import { getTrialFunnelSnapshotLast24h } from "@/lib/analytics/trialFunnelSnapshot";
import { requireUserWithClinic } from "@/lib/secure-api";

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const nowMs = Date.now();
  const url = new URL(req.url);
  const sinceMsRaw = Number(url.searchParams.get("since_ms") || 0);
  const untilMsRaw = Number(url.searchParams.get("until_ms") || 0);
  const snapshot = await getTrialFunnelSnapshotLast24h(nowMs, {
    sinceMs: Number.isFinite(sinceMsRaw) && sinceMsRaw > 0 ? sinceMsRaw : undefined,
    untilMs: Number.isFinite(untilMsRaw) && untilMsRaw > 0 ? untilMsRaw : undefined,
    cohort_key: url.searchParams.get("cohort_key") || undefined,
    experiment_id: url.searchParams.get("experiment_id") || undefined,
    variant_id: url.searchParams.get("variant_id") || undefined,
    utm_source: url.searchParams.get("utm_source") || undefined,
  });
  return NextResponse.json({ ok: true, snapshot });
}
