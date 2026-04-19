import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";
import { processDueLateAppointments } from "@/lib/scheduling/lateDueActions";

const bodySchema = z.object({
  clinic_id: z.number().int().positive().optional(),
});

/**
 * Cron-friendly: marks overdue expected arrivals as late and enqueues `core_outbox` patient ping (alert-only v1).
 */
export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  let json: unknown = {};
  try {
    if (req.headers.get("content-length") !== "0") json = await req.json();
  } catch {
    json = {};
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const pool = getPool();
    const { processed } = await processDueLateAppointments(pool, parsed.data.clinic_id);
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    opsLogError("internal/scheduling/late-due", e, { clinic_id: parsed.data.clinic_id });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
