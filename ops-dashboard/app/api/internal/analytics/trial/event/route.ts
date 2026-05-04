import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { appendTrialFunnelEvent } from "@/lib/analytics/trialFunnelStore";

const bodySchema = z.object({
  event: z.enum([
    "trial_started",
    "trial_step_viewed",
    "trial_step_completed",
    "trial_validation_failed",
    "trial_submitted",
    "trial_submit_failed",
    "trial_submit_success",
    "trial_rage_click",
    "trial_paid_conversion",
  ]),
  trial_session_id: z.string().min(6).max(120),
  clinic_id: z.number().int().positive().optional(),
  step: z.number().int().min(1).max(4).optional(),
  fields: z.array(z.string().min(1).max(80)).optional(),
  count: z.number().int().min(0).max(50).optional(),
  step_duration_ms: z.number().int().min(0).max(60 * 60 * 1000).optional(),
  reason: z.string().min(1).max(160).optional(),
  utm_source: z.string().min(1).max(120).optional(),
  utm_medium: z.string().min(1).max(120).optional(),
  utm_campaign: z.string().min(1).max(180).optional(),
  referrer: z.string().min(1).max(400).optional(),
  landing_path: z.string().min(1).max(400).optional(),
  experiment_id: z.string().min(1).max(120).optional(),
  variant_id: z.string().min(1).max(120).optional(),
  cohort_key: z.string().min(1).max(180).optional(),
  ts: z.string(),
  ts_ms: z.number().int().min(0),
});

export async function POST(req: Request) {
  const authErr = assertSchedulingServiceToken(req);
  if (authErr) return authErr;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  await appendTrialFunnelEvent(parsed.data);
  return NextResponse.json({ ok: true });
}
