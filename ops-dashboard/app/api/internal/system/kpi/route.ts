import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  const pool = getPool();
  const r = await pool.query(
    `SELECT routing->'last_decision' AS last_decision,
            routing->'last_decision_execution' AS last_decision_execution,
            routing->'decision_feedback' AS decision_feedback
     FROM conversations
     WHERE deleted_at IS NULL
       AND updated_at >= NOW() - interval '24 hours'
     ORDER BY updated_at DESC
     LIMIT 4000`,
  );

  let decisionTotal = 0;
  let emergencyTotal = 0;
  let uncertainTotal = 0;
  let autoBookExecTotal = 0;
  let autoBookExecSuccess = 0;
  let feedbackTotal = 0;
  let feedbackCorrected = 0;

  for (const row of r.rows) {
    const d = (row.last_decision ?? {}) as Record<string, unknown>;
    const ex = (row.last_decision_execution ?? {}) as Record<string, unknown>;
    const fb = (row.decision_feedback ?? {}) as Record<string, unknown>;

    if (typeof d.type === "string") {
      decisionTotal += 1;
      if (d.type === "EMERGENCY") emergencyTotal += 1;
      if (String(d.reason ?? "").includes("uncertain")) uncertainTotal += 1;
    }

    if (ex.action_type === "CREATE_APPOINTMENT") {
      autoBookExecTotal += 1;
      if (ex.status === "executed") autoBookExecSuccess += 1;
    }

    if (typeof fb.is_correct === "boolean") {
      feedbackTotal += 1;
      if (fb.is_correct === false) feedbackCorrected += 1;
    }
  }

  const toRate = (n: number, d: number): number => (d > 0 ? Number(((n / d) * 100).toFixed(2)) : 0);
  return NextResponse.json({
    ok: true,
    kpis: {
      emergency_rate_24h: toRate(emergencyTotal, decisionTotal),
      uncertain_rate_24h: toRate(uncertainTotal, decisionTotal),
      auto_book_success_rate_24h: toRate(autoBookExecSuccess, autoBookExecTotal),
      feedback_correction_rate_24h: toRate(feedbackCorrected, feedbackTotal),
    },
  });
}
