import type { Pool } from "pg";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";
import { parseListSelection1Based } from "./dialogueParse";
import type { StoredDialogueState } from "./dialogueTypes";
import type { NormalizedInboundRules } from "./normalizeInbound";
import { buildMainMenuResetTurn, dialogueStateClearedMerge, isSessionResetIntent } from "./dialogueSessionReset";
import { repromptMainMenu, welcomeMainMenu } from "./patientCopy";
import type { ConsumedBookingTurn } from "./bookingDialogueFlow";
import { startBookingDialogueFlow } from "./bookingDialogueFlow";
import { interpretInboundHeuristic } from "@/lib/scheduling/interpret";
import type { InterpretResult } from "@/lib/scheduling/types";

function nowIso(): string {
  return new Date().toISOString();
}

function isBookingKeyword(text: string): boolean {
  const w = text.toLowerCase();
  return ["حجز", "موعد", "appointment", "book", "reserve", "اريد حجز", "أريد حجز"].some((k) => w.includes(k));
}

function isPricingKeyword(text: string): boolean {
  const w = text.toLowerCase();
  return ["سعر", "كم", "تكلفة", "price", "cost", "اسعار", "أسعار"].some((k) => w.includes(k));
}

function menuMerge(): Record<string, unknown> {
  return dialogueStateClearedMerge();
}

function pricingReply(): ConsumedBookingTurn {
  return {
    reply_text:
      "لمعرفة التكلفة بدقة، أرسل نوع الخدمة أو الحالة المطلوبة (مثلاً: كشف، متابعة، إجراء معين).\n\n" +
      welcomeMainMenu(),
    finalIntent: "PRICING",
    finalPriority: 3,
    decision_source: "main_menu_pricing",
    handoff_required: false,
    dialogueMerge: menuMerge(),
  };
}

/**
 * Interactive main menu (1 حجز، 2 أسعار، 0 مساعدة) — replaces generic acknowledgments when idle.
 */
export async function tryConsumeMainMenuTurn(
  pool: Pool,
  args: {
    crm: InboundIngestRow;
    norm: NormalizedInboundRules;
    dialogue: StoredDialogueState;
    routing: Record<string, unknown>;
    interpret?: InterpretResult;
  },
): Promise<ConsumedBookingTurn | null> {
  const { crm, norm, dialogue: d, routing } = args;
  const step = d.flow_step;
  const text = norm.text.trim();

  if (step === "awaiting_main_menu") {
    const pick = parseListSelection1Based(text, 3);
    if (pick === 1 || (pick == null && isBookingKeyword(text))) {
      const int = args.interpret ?? interpretInboundHeuristic(text || "حجز");
      return startBookingDialogueFlow(pool, crm, norm, routing, { ...int, intent: "booking" }, text);
    }
    if (pick === 2 || (pick == null && isPricingKeyword(text))) {
      return pricingReply();
    }
    if (pick === 3) {
      return {
        reply_text: "سيتواصل معك أحد موظفي العيادة قريباً. شكراً لصبرك.\n\n" + welcomeMainMenu(),
        finalIntent: "GENERAL",
        finalPriority: 2,
        decision_source: "main_menu_handoff_hint",
        handoff_required: true,
        dialogueMerge: menuMerge(),
      };
    }
    return {
      reply_text: repromptMainMenu(),
      finalIntent: "GENERAL",
      finalPriority: 4,
      decision_source: "main_menu_reprompt",
      handoff_required: false,
      dialogueMerge: { consecutive_unparsed: (d.consecutive_unparsed ?? 0) + 1, updated_at: nowIso() },
    };
  }

  return null;
}

/** First contact or idle: show numbered menu instead of a passive acknowledgment. */
export function offerMainMenuTurn(): ConsumedBookingTurn {
  return buildMainMenuResetTurn();
}

export function shouldOfferMainMenu(dialogue: StoredDialogueState, norm: NormalizedInboundRules): boolean {
  if (norm.ruleIntent === "URGENT") return false;
  if (isSessionResetIntent(norm.text)) return true;
  if (dialogue.flow_step === "idle") return true;
  return false;
}
