import type { InterpretResult } from "@/lib/scheduling/types";

export type DecisionType = "EMERGENCY" | "BOOKING" | "NORMAL" | "UNKNOWN";

export type DecisionAction = "PRIORITIZE" | "AUTO_BOOK" | "SUGGEST_SLOTS" | "SEND_REPLY" | "NONE";

export type Decision = {
  type: DecisionType;
  actions: DecisionAction[];
  priority: number;
  reason: string;
  /** Optional Arabic line merged into scheduling path reply only (never sent alone). */
  reply_hint: string | null;
};

export type DecideActionInput = {
  interpret: InterpretResult;
  conversation_id: number;
  patient_id: number;
  calibration?: {
    risk_threshold?: number;
    confidence_threshold?: number;
    uncertain_mode_enabled?: boolean;
    medical_boosts?: {
      breathing_issue?: number;
    };
  };
};

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function signalBoost(
  interpret: InterpretResult,
  cfg?: { medical_boosts?: { breathing_issue?: number } },
): { boost: number; primary: string | null } {
  const s = interpret.medical_signals ?? {};
  const breathingBoost = Number.isFinite(cfg?.medical_boosts?.breathing_issue)
    ? Number(cfg?.medical_boosts?.breathing_issue)
    : 2;
  if (s.loss_of_consciousness) return { boost: 3, primary: "loss_of_consciousness" };
  if (s.breathing_issue) return { boost: breathingBoost, primary: "breathing_issue" };
  if (s.bleeding) return { boost: 1.5, primary: "bleeding" };
  if (s.severe_pain) return { boost: 1, primary: "severe_pain" };
  if (s.trauma) return { boost: 1, primary: "trauma" };
  return { boost: 0, primary: null };
}

function uniqueActions(actions: DecisionAction[]): DecisionAction[] {
  const out: DecisionAction[] = [];
  const seen = new Set<DecisionAction>();
  for (const a of actions) {
    if (a === "NONE") continue;
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out.length ? out : ["NONE"];
}

/**
 * Pure policy: maps interpret output to a structured decision for metrics, routing, and optional reply augmentation.
 * Execution (DB, WhatsApp) lives in actionExecutor / existing processInbound branches.
 */
export function decideAction(input: DecideActionInput): Decision {
  const int = input.interpret;
  const sys = int.system_event;
  const riskThreshold = Number.isFinite(input.calibration?.risk_threshold)
    ? Number(input.calibration?.risk_threshold)
    : 3.5;
  const confidenceThreshold = Number.isFinite(input.calibration?.confidence_threshold)
    ? Number(input.calibration?.confidence_threshold)
    : 0.7;
  const uncertainModeEnabled = input.calibration?.uncertain_mode_enabled !== false;
  const confidence = clampConfidence(Number(int.confidence ?? 0));
  const severity = int.emergency?.severity ?? (int.urgency === "critical" ? 5 : int.urgency === "high" ? 4 : int.urgency === "medium" ? 3 : 1);
  const baseRisk = severity * confidence;
  const medical = signalBoost(int, input.calibration);
  const risk = Number((baseRisk + medical.boost).toFixed(2));
  const isEmergencyOverride =
    sys?.type === "system_event" && String(sys.event || "").toLowerCase() === "emergency_override";
  const emergencyDetected =
    Boolean(int.emergency?.detected) ||
    int.intent === "urgent" ||
    int.intent === "emergency" ||
    int.urgency_level === "emergency" ||
    Boolean(int.medical_signals?.loss_of_consciousness) ||
    Boolean(int.medical_signals?.breathing_issue);
  const hasBookingSignal = int.intent === "booking" || Boolean(int.booking_intent);

  if (isEmergencyOverride) {
    return {
      type: "EMERGENCY",
      actions: uniqueActions(["PRIORITIZE", "AUTO_BOOK", "SEND_REPLY"]),
      priority: 100,
      reason: "system_event:emergency_override",
      /** Outbound copy is owned by runEmergencyFlow; UI reads routing.last_decision. */
      reply_hint: null,
    };
  }

  // Clinical safety overrides (not calibratable):
  // - loss_of_consciousness: always emergency
  // - breathing_issue: always high-priority even if thresholds are high
  if (int.medical_signals?.loss_of_consciousness) {
    return {
      type: "EMERGENCY",
      actions: uniqueActions(["PRIORITIZE", "AUTO_BOOK", "SEND_REPLY"]),
      priority: 100,
      reason: "clinical_override:loss_of_consciousness",
      reply_hint: "تم رصد مؤشر شديد الخطورة (فقدان وعي) وتم التصعيد الفوري كحالة طارئة.",
    };
  }
  if (int.medical_signals?.breathing_issue) {
    return {
      type: "EMERGENCY",
      actions: uniqueActions(["PRIORITIZE", "SEND_REPLY"]),
      priority: 96,
      reason: "clinical_override:breathing_issue_high_priority",
      reply_hint: "تم رفع أولوية الحالة فورًا بسبب صعوبة التنفس وسيتم مراجعتها طبيًا بشكل عاجل.",
    };
  }

  if (emergencyDetected) {
    if (risk >= riskThreshold && confidence >= confidenceThreshold) {
      const highRiskActions: DecisionAction[] =
        severity >= 5
          ? ["PRIORITIZE", "AUTO_BOOK", "SEND_REPLY"]
          : ["PRIORITIZE", ...(hasBookingSignal ? (["SUGGEST_SLOTS"] as DecisionAction[]) : []), "SEND_REPLY"];
      return {
        type: "EMERGENCY",
        actions: uniqueActions(highRiskActions),
        priority: severity >= 5 ? 100 : hasBookingSignal ? 91 : 90,
        reason: hasBookingSignal
          ? `emergency+booking:risk_${risk}_severity_${severity}_confidence_${confidence.toFixed(2)}${
              medical.primary ? `_medical_${medical.primary}` : ""
            }`
          : `emergency:risk_${risk}_severity_${severity}_confidence_${confidence.toFixed(2)}${
              medical.primary ? `_medical_${medical.primary}` : ""
            }`,
        reply_hint: hasBookingSignal
          ? "حالتك مستعجلة وسنقترح أقرب موعد متاح بأولوية."
          : "تم تصنيف رسالتك كحالة مستعجلة وسنعالجها بأولوية.",
      };
    }
    if (uncertainModeEnabled && risk >= 2) {
      return {
        type: "UNKNOWN",
        actions: uniqueActions(["PRIORITIZE", "SEND_REPLY"]),
        priority: 92,
        reason: `emergency:uncertain_risk_${risk}_severity_${severity}_confidence_${confidence.toFixed(2)}`,
        reply_hint: "يبدو أن الحالة قد تكون طارئة، سنحوّلها فورًا للمراجعة السريعة للتأكد.",
      };
    }
    return {
      type: "NORMAL",
      actions: uniqueActions(["SEND_REPLY"]),
      priority: 20,
      reason: `emergency:safe_mode_risk_${risk}_severity_${severity}_confidence_${confidence.toFixed(2)}`,
      reply_hint: "الأعراض غير كافية لتصعيد طارئ تلقائي الآن، وتم وضع الحالة تحت متابعة الفريق.",
    };
  }

  if (int.intent === "booking") {
    return {
      type: "BOOKING",
      actions: uniqueActions(["SUGGEST_SLOTS", "SEND_REPLY"]),
      priority: 50,
      reason: "intent:booking",
      reply_hint: null,
    };
  }

  if (int.intent === "unknown" && int.needs_human) {
    return {
      type: "UNKNOWN",
      actions: uniqueActions(["SEND_REPLY"]),
      priority: 15,
      reason: "intent:unknown_needs_human",
      reply_hint: null,
    };
  }

  if (int.intent === "question") {
    return {
      type: "NORMAL",
      actions: uniqueActions(["SEND_REPLY"]),
      priority: 12,
      reason: "intent:question",
      reply_hint: "إن رغبت بالحجز اذكر اليوم والوقت المناسبين لك وسنساعدك في اختيار موعد.",
    };
  }

  return {
    type: "NORMAL",
    actions: uniqueActions(["SEND_REPLY"]),
    priority: 10,
    reason: `intent:${int.intent}`,
    reply_hint: null,
  };
}
