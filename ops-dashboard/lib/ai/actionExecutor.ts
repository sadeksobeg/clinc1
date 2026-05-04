import type { Pool } from "pg";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";
import { incProductMetric } from "@/lib/observability/productMetrics";
import type { InterpretResult } from "@/lib/scheduling/types";
import { findNextSlots } from "@/lib/scheduling/slotService";
import type { Decision } from "./decisionEngine";
import { getRuntimeFlag } from "@/lib/system/emergencyMode";
import { guardPatientFacingDecision } from "@/lib/ai/patientSafetyGuard";
import { writeStructuredLog } from "@/lib/observability/trace";

export type ExecuteDecisionContext = {
  pool: Pool;
  crm: InboundIngestRow;
  interpret: InterpretResult;
  calibrationVersion?: number;
  shadowDecision?: {
    type: Decision["type"];
    reason: string;
    priority: number;
    mismatch: boolean;
    emergency_diff: boolean;
    severity_diff: number;
  } | null;
};

export type ExecuteDecisionResult = {
  /** Appended to `runSchedulingDecision` reply only (single WhatsApp send). */
  schedulingReplyAppend: string | null;
  skipped_duplicate: boolean;
};

export type SuggestedRoutingAction = {
  id: string;
  type: "CREATE_APPOINTMENT";
  status: "pending";
  created_at: string;
  reason: string;
  payload: {
    suggested_time: string;
    doctor_id: number;
    doctor_name: string;
    source_channel: string;
  };
};

export async function isDecisionEngineEnabled(): Promise<boolean> {
  const runtimeDisabled = await getRuntimeFlag("ai_autoreply_disabled");
  if (runtimeDisabled) return false;
  return (process.env.INBOUND_DECISION_ENGINE || "").trim() === "1";
}

function deriveSeverityFromInterpret(interpret: InterpretResult): number {
  if (typeof interpret.emergency?.severity === "number") return interpret.emergency.severity;
  if (interpret.urgency === "critical") return 5;
  if (interpret.urgency === "high") return 4;
  if (interpret.urgency === "medium") return 3;
  if (interpret.urgency === "low") return 1;
  return 2;
}

function derivePrimaryMedicalReason(interpret: InterpretResult): string | null {
  const s = interpret.medical_signals ?? {};
  if (s.loss_of_consciousness) return "loss_of_consciousness";
  if (s.breathing_issue) return "breathing_issue";
  if (s.bleeding) return "bleeding";
  if (s.severe_pain) return "severe_pain";
  if (s.trauma) return "trauma";
  if (s.infection_signs) return "infection_signs";
  if (s.mobility_issue) return "mobility_issue";
  if (s.psychological_distress) return "psychological_distress";
  return null;
}

function deriveMedicalBoost(interpret: InterpretResult): number {
  const s = interpret.medical_signals ?? {};
  if (s.loss_of_consciousness) return 3;
  if (s.breathing_issue) return 2;
  if (s.bleeding) return 1.5;
  if (s.severe_pain || s.trauma) return 1;
  return 0;
}

function lastDecisionPayload(
  decision: Decision,
  inboundMessageId: number,
  interpret: InterpretResult,
): Record<string, unknown> {
  const confidence = Number.isFinite(interpret.confidence) ? Number(interpret.confidence) : 0;
  const severity = deriveSeverityFromInterpret(interpret);
  const risk_score = Number(((Math.max(0, Math.min(1, confidence)) * severity) + deriveMedicalBoost(interpret)).toFixed(2));
  const primary_medical_reason = derivePrimaryMedicalReason(interpret);
  return {
    type: decision.type,
    actions: decision.actions,
    reason: decision.reason,
    priority: decision.priority,
    severity,
    confidence: Math.max(0, Math.min(1, confidence)),
    risk_score,
    primary_medical_reason,
    medical_signals: interpret.medical_signals ?? null,
    patient_context: interpret.patient_context ?? null,
    interpret_intent: interpret.intent,
    ts: new Date().toISOString(),
    inbound_message_id: inboundMessageId,
    engine_version: "mvp-1",
  };
}

/**
 * Side effects for decision layer: routing + metrics.
 * AUTO_BOOK is deferred: EMERGENCY real booking stays in runEmergencyFlow; BOOKING stays in dialogue — executor only records skips/metrics.
 * Never sends WhatsApp by itself.
 */
export async function executeDecision(ctx: ExecuteDecisionContext, decision: Decision): Promise<ExecuteDecisionResult> {
  if (!(await isDecisionEngineEnabled())) {
    return { schedulingReplyAppend: null, skipped_duplicate: false };
  }

  const { pool, crm } = ctx;
  const safety = guardPatientFacingDecision(decision, ctx.interpret);
  const effectiveDecision = safety.ok ? decision : safety.handoffDecision;
  if (!safety.ok) {
    incProductMetric("patient_safety_decision_blocked_total");
    try {
      await writeStructuredLog({
        level: "warn",
        eventName: "patient_safety.decision_guard",
        clinicId: crm.clinic_id,
        userId: null,
        message: "Blocked unsafe decision hints; forced handoff decision",
        payload: {
          violations: safety.violations,
          original_type: decision.type,
          inbound_message_id: crm.inbound_message_id,
        },
      });
    } catch {
      /* optional DB (e.g. unit tests without DATABASE_URL) */
    }
  }

  const mid = crm.inbound_message_id;

  const prev = await pool.query(
    `SELECT routing->'last_decision'->>'inbound_message_id' AS lid FROM conversations WHERE id = $1 AND clinic_id = $2`,
    [crm.conversation_id, crm.clinic_id],
  );
  const lid = prev.rows[0]?.lid as string | undefined;
  if (lid != null && lid === String(mid)) {
    incProductMetric("process_inbound_decision_idempotent_skip_total");
    return {
      schedulingReplyAppend: appendForSchedulingOnly(effectiveDecision),
      skipped_duplicate: true,
    };
  }

  incProductMetric("process_inbound_decision_total");
  if (effectiveDecision.type === "EMERGENCY") incProductMetric("process_inbound_decision_emergency_total");
  else if (effectiveDecision.type === "BOOKING") incProductMetric("process_inbound_decision_booking_total");
  else if (effectiveDecision.type === "UNKNOWN") incProductMetric("process_inbound_decision_unknown_total");
  else incProductMetric("process_inbound_decision_normal_total");
  if (effectiveDecision.reason.startsWith("emergency:uncertain_")) {
    incProductMetric("process_inbound_decision_uncertain_emergency_total");
  }

  const suggestedActions = await buildSuggestedActions(ctx, effectiveDecision);
  const payload = {
    ...lastDecisionPayload(effectiveDecision, mid, ctx.interpret),
    suggested_actions_count: suggestedActions.length,
  };
  const merge: Record<string, unknown> = {
    last_decision: payload,
    suggested_actions: suggestedActions,
  };
  if (!safety.ok) {
    merge.patient_safety_guard = {
      blocked: true,
      violations: safety.violations,
      original_decision_type: decision.type,
      ts: new Date().toISOString(),
    };
    merge.handoff_required = true;
  }
  if (typeof ctx.calibrationVersion === "number" && Number.isFinite(ctx.calibrationVersion)) {
    merge.decision_version = ctx.calibrationVersion;
  }
  if (ctx.shadowDecision) {
    merge.shadow_decision = {
      ...ctx.shadowDecision,
      ts: new Date().toISOString(),
    };
  }

  if (effectiveDecision.actions.includes("PRIORITIZE")) {
    merge.decision_priority = "high";
    incProductMetric("process_inbound_prioritized_total");
  }

  await pool.query(
    `UPDATE conversations
     SET routing = COALESCE(routing, '{}'::jsonb) || $1::jsonb,
         updated_at = NOW()
     WHERE id = $2 AND clinic_id = $3`,
    [JSON.stringify(merge), crm.conversation_id, crm.clinic_id],
  );

  if (effectiveDecision.actions.includes("AUTO_BOOK")) {
    incProductMetric("process_inbound_auto_book_skipped_total");
  }

  return {
    schedulingReplyAppend: appendForSchedulingOnly(effectiveDecision),
    skipped_duplicate: false,
  };
}

function appendForSchedulingOnly(decision: Decision): string | null {
  if (!decision.reply_hint?.trim()) return null;
  if (decision.type === "EMERGENCY" || decision.type === "BOOKING") return null;
  return decision.reply_hint.trim();
}

async function buildSuggestedActions(
  ctx: ExecuteDecisionContext,
  decision: Decision,
): Promise<SuggestedRoutingAction[]> {
  if (decision.type !== "EMERGENCY" && decision.type !== "BOOKING") return [];
  const first = await findFirstSlot(ctx.pool, ctx.crm.clinic_id, ctx.crm.conversation_id);
  if (!first) return [];
  return [
    {
      id: `create-appointment:${ctx.crm.inbound_message_id}`,
      type: "CREATE_APPOINTMENT",
      status: "pending",
      created_at: new Date().toISOString(),
      reason: decision.type === "EMERGENCY" ? "urgent" : "booking",
      payload: {
        suggested_time: first.starts_at,
        doctor_id: first.doctor_id,
        doctor_name: first.doctor_name,
        source_channel: decision.type === "EMERGENCY" ? "whatsapp_emergency" : "whatsapp_guided_booking",
      },
    },
  ];
}

async function findFirstSlot(
  pool: Pool,
  clinicId: number,
  conversationId: number,
): Promise<{ starts_at: string; doctor_id: number; doctor_name: string } | null> {
  const slots = await findNextSlots(pool, {
    clinicId,
    conversationId,
    limit: 1,
  });
  const first = slots[0];
  if (!first) return null;
  return {
    starts_at: first.starts_at,
    doctor_id: first.doctor_id,
    doctor_name: first.doctor_name,
  };
}
