import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";
import { incProductMetric } from "@/lib/observability/productMetrics";
import { insertAuditLog } from "@/lib/auditTrail";
import {
  buildCalibrationSuggestion,
  getCurrentCalibrationThresholds,
  type CalibrationSample,
} from "@/lib/ai/calibrationEngine";

const bodySchema = z.object({
  clinic_id: z.number().int().positive().default(1),
  action: z.enum(["suggest", "apply", "reject"]),
  actor_user_id: z.string().min(2).max(120).optional(),
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

  try {
    const pool = getPool();
    const clinicR = await pool.query(
      `SELECT id, metadata
       FROM clinics
       WHERE id = $1 AND deleted_at IS NULL`,
      [body.clinic_id],
    );
    if (!clinicR.rows[0]) {
      return NextResponse.json({ ok: false, error: "clinic_not_found" }, { status: 404 });
    }

    const metadata = (clinicR.rows[0].metadata ?? {}) as Record<string, unknown>;
    const aiCalibration = (metadata.ai_calibration ?? {}) as Record<string, unknown>;
    const currentScope = typeof aiCalibration.scope === "string" ? aiCalibration.scope : "clinic_v1";
    if (currentScope !== "clinic_v1") {
      incProductMetric("calibration_blocked_total");
      return NextResponse.json({
        ok: true,
        ai_calibration: aiCalibration,
        warning: "scope_mismatch",
      });
    }

    if (body.action === "apply") {
      const suggested = (aiCalibration.suggested ?? null) as Record<string, unknown> | null;
      if (!suggested) {
        incProductMetric("calibration_blocked_total");
        return NextResponse.json({ ok: false, error: "no_suggested_calibration" }, { status: 400 });
      }
      const currentBefore = getCurrentCalibrationThresholds(metadata);
      const nextVersion = Number(aiCalibration.version ?? 0) + 1;
      const nowIso = new Date().toISOString();
      const watchUntilIso = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      const next = {
        ...(aiCalibration ?? {}),
        scope: "clinic_v1",
        version: nextVersion,
        last_safe: currentBefore,
        current: {
          risk_threshold: Number(suggested.suggested_risk_threshold ?? 3.5),
          confidence_threshold: Number(suggested.suggested_confidence_threshold ?? 0.7),
          medical_boosts: {
            breathing_issue: Number(suggested.suggested_breathing_boost ?? 2),
          },
        },
        suggested: null,
        watch_started_at: nowIso,
        watch_until: watchUntilIso,
        last_updated: nowIso,
        last_action: "applied",
      };
      await pool.query(
        `UPDATE clinics
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify({ ai_calibration: next }), body.clinic_id],
      );
      incProductMetric("calibration_applied_total");
      await insertAuditLog(pool, {
        clinicId: body.clinic_id,
        action: "ai.calibration.apply",
        entityType: "clinic",
        entityId: String(body.clinic_id),
        payload: {
          actor_user_id: body.actor_user_id ?? "ops_staff",
          before: currentBefore,
          after: next.current,
        },
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, ai_calibration: next });
    }

    if (body.action === "reject") {
      const nowIso = new Date().toISOString();
      const next = {
        ...(aiCalibration ?? {}),
        suggested: null,
        scope: "clinic_v1",
        last_updated: nowIso,
        last_action: "rejected",
      };
      await pool.query(
        `UPDATE clinics
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify({ ai_calibration: next }), body.clinic_id],
      );
      incProductMetric("calibration_rejected_total");
      await insertAuditLog(pool, {
        clinicId: body.clinic_id,
        action: "ai.calibration.reject",
        entityType: "clinic",
        entityId: String(body.clinic_id),
        payload: {
          actor_user_id: body.actor_user_id ?? "ops_staff",
          current: getCurrentCalibrationThresholds(metadata),
        },
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, ai_calibration: next });
    }

    if (
      aiCalibration.last_action === "applied" &&
      typeof aiCalibration.last_updated === "string" &&
      Date.now() - new Date(aiCalibration.last_updated).getTime() < 24 * 60 * 60 * 1000
    ) {
      incProductMetric("calibration_blocked_total");
      return NextResponse.json({
        ok: true,
        ai_calibration: {
          ...(aiCalibration ?? {}),
          current: getCurrentCalibrationThresholds(metadata),
        },
        warning: "freeze_window_active",
      });
    }

    const feedbackR = await pool.query(
      `SELECT routing->'last_decision' AS last_decision,
              routing->'decision_feedback' AS decision_feedback,
              routing->'last_decision_execution' AS last_decision_execution
       FROM conversations
       WHERE clinic_id = $1
         AND deleted_at IS NULL
         AND routing ? 'decision_feedback'
       ORDER BY updated_at DESC
       LIMIT 300`,
      [body.clinic_id],
    );

    const samples: CalibrationSample[] = feedbackR.rows.map((row) => {
      const lastDecision = (row.last_decision ?? {}) as Record<string, unknown>;
      const feedback = (row.decision_feedback ?? {}) as Record<string, unknown>;
      return {
        model_decision: typeof lastDecision.type === "string" ? lastDecision.type : null,
        corrected_decision: typeof feedback.corrected_decision === "string" ? feedback.corrected_decision : null,
        reviewer: typeof feedback.reviewed_by === "string" ? feedback.reviewed_by : null,
        note: typeof feedback.note === "string" ? feedback.note : null,
        has_execution: row.last_decision_execution != null,
        model_signals: ((lastDecision.medical_signals ?? {}) as { breathing_issue?: boolean }) || {},
        corrected_signals:
          feedback.corrected_medical_signals && typeof feedback.corrected_medical_signals === "object"
            ? (feedback.corrected_medical_signals as { breathing_issue?: boolean })
            : null,
      };
    });

    const current = getCurrentCalibrationThresholds(metadata);
    const suggestion = buildCalibrationSuggestion(samples, current);
    if (!suggestion) {
      incProductMetric("calibration_blocked_total");
      return NextResponse.json({
        ok: true,
        ai_calibration: {
          ...(aiCalibration ?? {}),
          current,
          suggested: null,
          sample_size: samples.length,
          last_updated: new Date().toISOString(),
        },
        warning: "not_enough_samples",
      });
    }
    if (
      suggestion.suggested_risk_threshold < 2.5 ||
      suggestion.suggested_risk_threshold > 4.5 ||
      suggestion.suggested_confidence_threshold < 0.4
    ) {
      incProductMetric("calibration_blocked_total");
      return NextResponse.json({
        ok: true,
        ai_calibration: {
          ...(aiCalibration ?? {}),
          current,
          suggested: null,
          sample_size: suggestion.stats.sample_size,
          last_updated: new Date().toISOString(),
        },
        warning: "safety_hard_stop",
      });
    }

    const next = {
      ...(aiCalibration ?? {}),
      scope: "clinic_v1",
      current,
      suggested: suggestion,
      sample_size: suggestion.stats.sample_size,
      last_updated: new Date().toISOString(),
      last_action: "suggested",
    };

    await pool.query(
      `UPDATE clinics
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({ ai_calibration: next }), body.clinic_id],
    );
    incProductMetric("calibration_suggestion_generated_total");
    await insertAuditLog(pool, {
      clinicId: body.clinic_id,
      action: "ai.calibration.suggest",
      entityType: "clinic",
      entityId: String(body.clinic_id),
      payload: {
        actor_user_id: body.actor_user_id ?? "ops_staff",
        before: current,
        suggested: suggestion,
      },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, ai_calibration: next });
  } catch (e) {
    opsLogError("internal/ai/calibration", e, { clinic_id: body.clinic_id, action: body.action });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
