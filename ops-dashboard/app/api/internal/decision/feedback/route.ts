import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";
import { incProductMetric } from "@/lib/observability/productMetrics";

const bodySchema = z.object({
  clinic_id: z.number().int().positive().default(1),
  conversation_id: z.number().int().positive(),
  is_correct: z.boolean(),
  corrected_decision: z.enum(["EMERGENCY", "BOOKING", "NORMAL", "UNKNOWN"]).optional(),
  corrected_severity: z.number().int().min(1).max(5).optional(),
  corrected_medical_signals: z
    .object({
      breathing_issue: z.boolean().optional(),
      bleeding: z.boolean().optional(),
      severe_pain: z.boolean().optional(),
      loss_of_consciousness: z.boolean().optional(),
      trauma: z.boolean().optional(),
      infection_signs: z.boolean().optional(),
      mobility_issue: z.boolean().optional(),
      psychological_distress: z.boolean().optional(),
    })
    .optional(),
  corrected_primary_signal: z
    .enum([
      "breathing_issue",
      "bleeding",
      "severe_pain",
      "loss_of_consciousness",
      "trauma",
      "infection_signs",
      "mobility_issue",
      "psychological_distress",
    ])
    .nullable()
    .optional(),
  corrected_patient_context: z
    .object({
      is_child: z.boolean().optional(),
      is_elderly: z.boolean().optional(),
      chronic_condition: z.boolean().optional(),
    })
    .optional(),
  note: z.string().max(500).optional(),
  reviewed_by: z.string().min(2).max(120).optional(),
});

export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

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
  const body = parsed.data;
  incProductMetric("decision_feedback_total");

  try {
    const pool = getPool();
    const reviewer = (body.reviewed_by ?? "ops_staff").trim() || "ops_staff";
    const recentFeedbackR = await pool.query(
      `SELECT routing->'decision_feedback' AS decision_feedback
       FROM conversations
       WHERE clinic_id = $1
         AND deleted_at IS NULL
         AND routing ? 'decision_feedback'
       ORDER BY updated_at DESC
       LIMIT 500`,
      [body.clinic_id],
    );
    const sinceMs = Date.now() - 60 * 60 * 1000;
    let reviewerCount = 0;
    for (const row of recentFeedbackR.rows) {
      const fb = (row.decision_feedback ?? {}) as Record<string, unknown>;
      if (String(fb.reviewed_by ?? "") !== reviewer) continue;
      const reviewedAt = Date.parse(String(fb.reviewed_at ?? ""));
      if (Number.isFinite(reviewedAt) && reviewedAt >= sinceMs) reviewerCount += 1;
      if (reviewerCount >= 20) break;
    }
    if (reviewerCount >= 20) {
      incProductMetric("decision_feedback_error_total");
      return NextResponse.json({ ok: false, error: "feedback_rate_limited" }, { status: 429 });
    }

    const convR = await pool.query(
      `SELECT id, clinic_id, routing
       FROM conversations
       WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
      [body.conversation_id, body.clinic_id],
    );
    if (!convR.rows[0]) {
      incProductMetric("decision_feedback_error_total");
      return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
    }

    const currentRouting = (convR.rows[0]?.routing ?? {}) as Record<string, unknown>;
    const currentDecision = ((currentRouting.last_decision ?? {}) as Record<string, unknown>) || {};
    const currentSignals = ((currentDecision.medical_signals ?? {}) as Record<string, unknown>) || {};
    const correctedSignals = body.corrected_medical_signals ?? {};
    const signalKeys = [
      "breathing_issue",
      "bleeding",
      "severe_pain",
      "loss_of_consciousness",
      "trauma",
      "infection_signs",
      "mobility_issue",
      "psychological_distress",
    ] as const;
    const hasMismatch = signalKeys.some((k) => {
      if (typeof correctedSignals[k] !== "boolean") return false;
      return Boolean(currentSignals[k]) !== Boolean(correctedSignals[k]);
    });
    if (hasMismatch) {
      incProductMetric("decision_feedback_medical_signal_mismatch_total");
    }

    const feedback = {
      is_correct: body.is_correct,
      corrected_decision: body.corrected_decision ?? null,
      corrected_severity: body.corrected_severity ?? null,
      corrected_medical_signals: body.corrected_medical_signals ?? null,
      corrected_primary_signal: body.corrected_primary_signal ?? null,
      corrected_patient_context: body.corrected_patient_context ?? null,
      note: body.note ?? null,
      reviewed_by: reviewer,
      reviewed_at: new Date().toISOString(),
      mismatch_detected: hasMismatch,
    };

    await pool.query(
      `UPDATE conversations
       SET routing = COALESCE(routing, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3`,
      [JSON.stringify({ decision_feedback: feedback }), body.conversation_id, body.clinic_id],
    );
    incProductMetric("decision_feedback_success_total");
    return NextResponse.json({ ok: true, feedback });
  } catch (e) {
    incProductMetric("decision_feedback_error_total");
    opsLogError("internal/decision/feedback", e, {
      clinic_id: body.clinic_id,
      conversation_id: body.conversation_id,
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
