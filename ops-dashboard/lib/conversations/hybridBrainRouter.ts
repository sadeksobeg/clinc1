import type { Pool } from "pg";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";
import { setConversationHandoffPending } from "@/lib/ai/AIModelAdapter";
import { specialtySearchTokenFromText } from "@/lib/ai/doctorMatch";
import { tryAcquireAiBudgetSlot } from "@/lib/messaging/interpretAiBudget";
import { incProductMetric } from "@/lib/observability/productMetrics";
import { interpretInboundText } from "@/lib/scheduling/interpret";
import type { InterpretBrainContext } from "@/lib/scheduling/interpret";
import type { InterpretResult } from "@/lib/scheduling/types";
import { startBookingDialogueFlow, type ConsumedBookingTurn } from "./bookingDialogueFlow";
import { buildPricingReplyTurn } from "./mainMenuFlow";
import type { NormalizedInboundRules } from "./normalizeInbound";
import type { StoredDialogueState } from "./dialogueTypes";

/** Minimum confidence to start booking from free-text (Ollama or strong heuristic). */
export const HYBRID_BOOKING_CONFIDENCE = 0.55;

export type HybridBrainRouteResult =
  | { action: "consumed"; turn: ConsumedBookingTurn; interpret: InterpretResult }
  | { action: "handoff"; interpret: InterpretResult }
  | { action: "continue"; interpret: InterpretResult }
  | { action: "menu" };

export function isNumericMainMenuChoice(text: string): boolean {
  const t = text.trim();
  return /^[1230]$/.test(t);
}

function isPricingKeyword(text: string): boolean {
  const w = text.toLowerCase();
  return ["سعر", "كم", "تكلفة", "price", "cost", "اسعار", "أسعار", "كشفية", "كشف"].some((k) => w.includes(k));
}

function hasMedicalSignals(int: InterpretResult): boolean {
  const m = int.medical_signals;
  if (!m) return false;
  return Boolean(
    m.breathing_issue ||
      m.bleeding ||
      m.severe_pain ||
      m.loss_of_consciousness ||
      m.trauma ||
      m.infection_signs ||
      m.mobility_issue ||
      m.psychological_distress,
  );
}

function isSymptomOrMedicalFreeText(text: string): boolean {
  const w = text.toLowerCase();
  return ["حرارة", "حمى", "كحة", "سعال", "ألم", "الم", "وجع", "غثيان", "قيء", "طفل", "ابني", "ابنتي", "symptom", "fever", "cough"].some(
    (k) => w.includes(k),
  );
}

function isEmergencyInterpret(int: InterpretResult): boolean {
  return (
    int.intent === "emergency" ||
    int.intent === "urgent" ||
    int.urgency_level === "emergency" ||
    Boolean(int.emergency?.detected) ||
    int.urgency === "critical" ||
    int.urgency === "high"
  );
}

/** Merge specialty/doctor hints from text when the model omitted them. */
export function enrichInterpretForRouting(int: InterpretResult, text: string): InterpretResult {
  const token = specialtySearchTokenFromText(text, int.doctor_hint, int.specialty);
  const specialty = int.specialty || token || null;
  let doctor_hint = int.doctor_hint;
  if (!doctor_hint) {
    const m = text.match(/د\.?\s*([\u0600-\u06FFa-zA-Z]+)/i);
    if (m?.[1]) doctor_hint = m[1].trim();
  }
  if (specialty === int.specialty && doctor_hint === int.doctor_hint) return int;
  return { ...int, specialty, doctor_hint };
}

function shouldHandoffForMedical(int: InterpretResult, text: string): boolean {
  if (int.needs_human) return true;
  if (int.intent === "complaint") return true;
  if (hasMedicalSignals(int)) return true;
  if (isSymptomOrMedicalFreeText(text) && int.intent !== "booking" && int.intent !== "cancel" && int.intent !== "reschedule") {
    return true;
  }
  return false;
}

function shouldRoutePricing(norm: NormalizedInboundRules, text: string, int: InterpretResult): boolean {
  if (norm.ruleIntent === "PRICING") return true;
  if (isPricingKeyword(text)) return true;
  if (int.intent === "question" && isPricingKeyword(text)) return true;
  return false;
}

function shouldRouteBooking(int: InterpretResult, text: string): boolean {
  if (int.intent === "booking" || int.intent === "reschedule") {
    return int.confidence >= HYBRID_BOOKING_CONFIDENCE || Boolean(int.specialty || int.doctor_hint);
  }
  const w = text.toLowerCase();
  const bookingKw = ["حجز", "موعد", "appointment", "book", "بدي موعد", "أريد موعد", "طبيب", "دكتور"].some((k) => w.includes(k));
  return bookingKw && int.confidence >= HYBRID_BOOKING_CONFIDENCE;
}

export function routeInterpretToHybridAction(
  int: InterpretResult,
  norm: NormalizedInboundRules,
  text: string,
): HybridBrainRouteResult | null {
  const enriched = enrichInterpretForRouting(int, text);

  if (isEmergencyInterpret(enriched)) {
    incProductMetric("hybrid_brain_routed_total");
    return { action: "continue", interpret: enriched };
  }

  if (shouldHandoffForMedical(enriched, text)) {
    incProductMetric("hybrid_brain_routed_total");
    return { action: "handoff", interpret: enriched };
  }

  if (shouldRoutePricing(norm, text, enriched)) {
    incProductMetric("hybrid_brain_routed_total");
    return { action: "consumed", turn: buildPricingReplyTurn(), interpret: enriched };
  }

  if (shouldRouteBooking(enriched, text)) {
    return null;
  }

  if (enriched.confidence < HYBRID_BOOKING_CONFIDENCE && enriched.intent === "unknown") {
    incProductMetric("hybrid_brain_menu_fallback_total");
    return { action: "menu" };
  }

  if (enriched.intent === "question" || enriched.intent === "info" || enriched.intent === "followup") {
    if (enriched.confidence >= 0.5 && !isPricingKeyword(text)) {
      incProductMetric("hybrid_brain_menu_fallback_total");
      return { action: "menu" };
    }
  }

  incProductMetric("hybrid_brain_menu_fallback_total");
  return { action: "menu" };
}

/**
 * Ollama/heuristic interpret + route before the idle main menu.
 * Returns null when hybrid routing should not run (no Ollama URL, wrong step, menu digit).
 */
export async function tryHybridBrainRoute(
  pool: Pool,
  args: {
    crm: InboundIngestRow;
    norm: NormalizedInboundRules;
    dialogue: StoredDialogueState;
    routing: Record<string, unknown>;
    interpretText: string;
    brainCtx: InterpretBrainContext;
  },
): Promise<HybridBrainRouteResult | null> {
  const ollamaConfigured = Boolean((process.env.OLLAMA_URL || "").trim());
  if (!ollamaConfigured) return null;
  if (args.dialogue.flow_step !== "idle") return null;
  if (args.norm.ruleIntent === "URGENT") return null;
  if (isNumericMainMenuChoice(args.norm.text)) return null;

  const allowAi = await tryAcquireAiBudgetSlot(args.crm.conversation_id);
  let int: InterpretResult;
  if (!allowAi) {
    incProductMetric("process_inbound_ai_rate_limited_total");
    incProductMetric("ollama_interpret_fallback_total");
    return { action: "menu" };
  }

  int = await interpretInboundText(args.interpretText, args.brainCtx);
  if (int.source === "ollama") {
    incProductMetric("ollama_interpret_ok_total");
  } else {
    incProductMetric("ollama_interpret_fallback_total");
  }

  const routed = routeInterpretToHybridAction(int, args.norm, args.norm.text.trim());
  if (!routed) {
    const enriched = enrichInterpretForRouting(int, args.norm.text);
    const bookingInt: InterpretResult = { ...enriched, intent: "booking" };
    incProductMetric("hybrid_brain_routed_total");
    const turn = await startBookingDialogueFlow(pool, args.crm, args.norm, args.routing, bookingInt, args.norm.text);
    return { action: "consumed", turn, interpret: bookingInt };
  }

  if (routed.action === "handoff") {
    await setConversationHandoffPending(
      pool,
      args.crm.conversation_id,
      args.crm.clinic_id,
      routed.interpret.summary || (routed.interpret.needs_human ? "medical_triage" : "hybrid_brain_handoff"),
    );
    incProductMetric("process_inbound_ai_handoff_total");
  }

  return routed;
}

export function isHybridBrainEnabled(): boolean {
  return Boolean((process.env.OLLAMA_URL || "").trim());
}
