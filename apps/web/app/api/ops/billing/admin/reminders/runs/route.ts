import { NextResponse } from "next/server";
import { fetchBillingReminderRuns } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  try {
    const result = await fetchBillingReminderRuns();
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "billing_reminder_runs_unavailable" },
      { status: 502 },
    );
  }
}
