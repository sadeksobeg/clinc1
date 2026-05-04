import { NextResponse } from "next/server";
import { runBillingReminders } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  try {
    const result = await runBillingReminders({ trigger_source: "admin_api" });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "billing_reminders_unavailable" },
      { status: 502 },
    );
  }
}
