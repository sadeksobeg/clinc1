import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  dispatchIntentHandler,
  handleGreeting,
  handleNegation,
  handleOutOfContext,
  handleUnknown,
  type IntentHandlerContext,
} from "./intentHandlers";
import { normalizeArabicMessage } from "./messageNormalizer";
import type { NormalizedInboundRules } from "./normalizeInbound";
import type { StoredDialogueState } from "./dialogueTypes";

vi.mock("@/lib/ai/AIModelAdapter", () => ({
  setConversationHandoffPending: vi.fn().mockResolvedValue(undefined),
}));

function baseCtx(overrides: Partial<IntentHandlerContext> = {}): IntentHandlerContext {
  const dialogue: StoredDialogueState = {
    flow_step: "idle",
    pending_kind: null,
    consecutive_unparsed: 0,
    updated_at: new Date().toISOString(),
    ...(overrides.dialogue || {}),
  };
  const norm = {
    text: "test",
    ruleIntent: "GENERAL",
    alertTo: "",
    workflowStartedAt: Date.now(),
    from: "9627",
  } as NormalizedInboundRules;
  return {
    pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool,
    crm: {
      clinic_id: 1,
      patient_id: 2,
      conversation_id: 3,
      inbound_message_id: 4,
      text: norm.text,
      patient_display_name: null,
      dedupeHash: "x",
    },
    norm,
    dialogue,
    routing: {},
    message: normalizeArabicMessage(norm.text),
    clinicId: 1,
    ...overrides,
  };
}

describe("intentHandlers", () => {
  it("handleGreeting on idle returns main menu reset", () => {
    const turn = handleGreeting(baseCtx({ norm: { ...baseCtx().norm, text: "مرحبا" } as NormalizedInboundRules }), true);
    expect(turn.decision_source).toMatch(/main_menu|rules_greeting/);
    expect(turn.reply_text.length).toBeGreaterThan(10);
  });

  it("handleOutOfContext steers back to clinic menu", () => {
    const turn = handleOutOfContext(baseCtx());
    expect(turn.reply_text).toContain("مساعد العيادة");
    expect(turn.decision_source).toBe("rules_out_of_context");
  });

  it("handleNegation during awaiting_confirm clears slot offer", async () => {
    const ctx = baseCtx({
      dialogue: { flow_step: "awaiting_confirm", pending_kind: "booking", updated_at: new Date().toISOString() },
    });
    const turn = await handleNegation(ctx);
    expect(turn?.decision_source).toBe("rules_negation_slot");
    expect(turn?.dialogueMerge?.flow_step).toBe("slot_offer");
  });

  it("dispatchIntentHandler routes PRICE_INQUIRY to pricing copy", async () => {
    const msg = normalizeArabicMessage("كم الكشف");
    const ctx = baseCtx({ message: msg, norm: { ...baseCtx().norm, text: "كم الكشف" } as NormalizedInboundRules });
    const turn = await dispatchIntentHandler(ctx);
    expect(turn).not.toBe("handoff");
    expect(turn && typeof turn === "object" && turn.finalIntent).toBe("PRICING");
  });

  it("handleUnknown handoffs after consecutive unparsed", async () => {
    const ctx = baseCtx({
      dialogue: {
        flow_step: "idle",
        pending_kind: null,
        consecutive_unparsed: 1,
        updated_at: new Date().toISOString(),
      },
      message: normalizeArabicMessage("xyz gibberish"),
    });
    const result = await handleUnknown(ctx);
    expect(result).toBe("handoff");
  });
});
