import type { ConversationDetail } from "@/types/ops";

export type TimelineTone = "danger" | "warning" | "success" | "normal";

export type DecisionTimelineItem = {
  id: "interpret" | "decision" | "execution" | "emergency" | "feedback";
  title: string;
  tone: TimelineTone;
  ts?: string;
  lines: string[];
};

function n(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function timelineToneFromDecision(decisionType?: string, reason?: string): TimelineTone {
  const t = (decisionType ?? "").toUpperCase();
  const r = (reason ?? "").toLowerCase();
  if (r.startsWith("emergency:uncertain_")) return "warning";
  if (t === "EMERGENCY") return "danger";
  if (t === "UNKNOWN") return "warning";
  return "normal";
}

export function buildDecisionTimeline(detail: ConversationDetail | undefined): DecisionTimelineItem[] {
  const routing = detail?.routing ?? {};
  const decision = (routing.last_decision ?? {}) as Record<string, unknown>;
  const execution = (routing.last_decision_execution ?? {}) as Record<string, unknown>;
  const emergency = (routing.last_emergency_event ?? {}) as Record<string, unknown>;
  const feedback = (routing.decision_feedback ?? {}) as Record<string, unknown>;

  const items: DecisionTimelineItem[] = [];

  const interpretIntent = String(decision.interpret_intent ?? "").trim();
  const severity = n(decision.severity);
  const confidence = n(decision.confidence);
  const risk = n(decision.risk_score);
  const medicalReason = typeof decision.primary_medical_reason === "string" ? decision.primary_medical_reason : null;
  if (interpretIntent || severity != null || confidence != null) {
    items.push({
      id: "interpret",
      title: "🧠 تم تفسير الرسالة",
      tone: severity != null && severity >= 4 ? "warning" : "normal",
      ts: typeof decision.ts === "string" ? decision.ts : undefined,
      lines: [
        interpretIntent ? `النية: ${interpretIntent}` : "النية: غير محددة",
        severity != null ? `الطوارئ: ${severity >= 3 ? "نعم" : "لا"} (severity ${severity})` : "الطوارئ: غير متاح",
        confidence != null ? `الثقة: ${confidence.toFixed(2)}` : "الثقة: غير متاحة",
        risk != null ? `مؤشر الخطر (risk): ${risk.toFixed(2)}` : "",
        medicalReason ? `إشارة طبية أساسية: ${medicalReason}` : "",
      ],
    });
  }

  const decisionType = String(decision.type ?? "").trim();
  const decisionReason = String(decision.reason ?? "").trim();
  const decisionActions = Array.isArray(decision.actions) ? decision.actions.map((a) => String(a)).filter(Boolean) : [];
  if (decisionType || decisionReason || decisionActions.length) {
    items.push({
      id: "decision",
      title: "⚖️ قرار النظام",
      tone: timelineToneFromDecision(decisionType, decisionReason),
      ts: typeof decision.ts === "string" ? decision.ts : undefined,
      lines: [
        decisionType ? `النوع: ${decisionType}` : "النوع: غير متاح",
        decisionActions.length ? `الإجراء: ${decisionActions.join(", ")}` : "الإجراء: لا يوجد",
        decisionReason ? `السبب: ${decisionReason}` : "السبب: غير متاح",
      ],
    });
  }

  const execStatus = String(execution.status ?? "").trim();
  const execDecision = String(execution.decision ?? "").trim();
  const execType = String(execution.action_type ?? "").trim();
  const execReason = Array.isArray(execution.reason) ? execution.reason.map((r) => String(r)).filter(Boolean) : [];
  if (execStatus || execDecision || execType || execReason.length) {
    const tone: TimelineTone =
      execStatus === "executed" ? "success" : execStatus === "blocked" || execStatus === "error" ? "warning" : "normal";
    items.push({
      id: "execution",
      title: "⚡ التنفيذ",
      tone,
      ts: typeof execution.ts === "string" ? execution.ts : undefined,
      lines: [
        execType ? `نوع الإجراء: ${execType}` : "نوع الإجراء: غير متاح",
        execDecision ? `قرار التنفيذ: ${execDecision}` : "قرار التنفيذ: غير متاح",
        execStatus ? `الحالة: ${execStatus}` : "الحالة: غير متاحة",
        execReason.length ? `سبب عدم التنفيذ: ${execReason.join(", ")}` : "",
      ].filter(Boolean),
    });
  }

  const emergencyStatus = String(emergency.status ?? "").trim();
  const emergencyOutcome = String(emergency.outcome ?? "").trim();
  if (emergencyStatus || emergencyOutcome) {
    const bumpedCount = n(emergency.bumped_count) ?? 0;
    const bumpedNotified = n(emergency.bumped_notified) ?? 0;
    items.push({
      id: "emergency",
      title: "🚑 إجراء الطوارئ",
      tone: emergencyStatus === "allocated" ? "danger" : "warning",
      ts: typeof emergency.ts === "string" ? emergency.ts : undefined,
      lines: [
        emergencyStatus ? `الحالة: ${emergencyStatus}` : "الحالة: غير متاحة",
        emergencyOutcome ? `النتيجة: ${emergencyOutcome}` : "",
        bumpedCount > 0 ? `إعادة جدولة المرضى: ${bumpedCount}` : "",
        bumpedCount > 0 ? `إشعارات المرضى المتأثرين: ${bumpedNotified}/${bumpedCount}` : "",
      ].filter(Boolean),
    });
  }

  const reviewedAt = typeof feedback.reviewed_at === "string" ? feedback.reviewed_at : undefined;
  if (reviewedAt) {
    const isCorrect = feedback.is_correct === true;
    items.push({
      id: "feedback",
      title: "✅ تقييم الفريق للقرار",
      tone: isCorrect ? "success" : "warning",
      ts: reviewedAt,
      lines: [
        `النتيجة: ${isCorrect ? "القرار صحيح" : "تم تصحيح القرار"}`,
        feedback.corrected_decision ? `التصنيف المصحح: ${String(feedback.corrected_decision)}` : "",
        feedback.corrected_severity != null ? `severity المصحح: ${String(feedback.corrected_severity)}` : "",
        feedback.note ? `ملاحظة: ${String(feedback.note)}` : "",
        feedback.reviewed_by ? `المراجع: ${String(feedback.reviewed_by)}` : "",
      ].filter(Boolean),
    });
  }

  return items;
}
