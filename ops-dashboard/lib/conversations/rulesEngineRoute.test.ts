import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { tryRulesEngineRoute } from "./rulesEngineRoute";
import type { NormalizedInboundRules } from "./normalizeInbound";
import type { StoredDialogueState } from "./dialogueTypes";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";

vi.mock("@/lib/scheduling/appointmentService", () => ({
  staffCancelAppointment: vi.fn().mockResolvedValue({ ok: true }),
}));

function buildPoolMock(): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn(),
  } as unknown as Pool;
}

function baseArgs(text: string, dialogue: Partial<StoredDialogueState> = {}) {
  const norm = {
    text,
    ruleIntent: "GENERAL",
    alertTo: "",
    workflowStartedAt: Date.now(),
    from: "9627",
  } as NormalizedInboundRules;
  const crm = {
    clinic_id: 1,
    patient_id: 2,
    conversation_id: 99,
    inbound_message_id: 5,
    text,
    patient_display_name: null,
    dedupeHash: "hash",
  } as InboundIngestRow;
  const fullDialogue: StoredDialogueState = {
    flow_step: "idle",
    pending_kind: null,
    consecutive_unparsed: 0,
    updated_at: new Date().toISOString(),
    ...dialogue,
  };
  return { crm, norm, dialogue: fullDialogue, routing: {} as Record<string, unknown> };
}

describe("tryRulesEngineRoute", () => {
  it("skips interactive slot_offer turns", async () => {
    const pool = buildPoolMock();
    const args = baseArgs("أيوه", { flow_step: "slot_offer" });
    const result = await tryRulesEngineRoute(pool, args);
    expect(result).toBeNull();
  });

  it("skips numeric main menu choices", async () => {
    const pool = buildPoolMock();
    const args = baseArgs("2");
    const result = await tryRulesEngineRoute(pool, args);
    expect(result).toBeNull();
  });

  it("routes idle greeting to a consumed turn", async () => {
    const pool = buildPoolMock();
    const args = baseArgs("مرحبا");
    const result = await tryRulesEngineRoute(pool, args);
    expect(result).not.toBeNull();
    expect(result).not.toBe("handoff");
    if (result && typeof result === "object") {
      expect(result.reply_text.length).toBeGreaterThan(5);
    }
  });

  it("handles awaiting_cancel_confirm affirmation path", async () => {
    const pool = buildPoolMock();
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes("staffCancelAppointment") || s.includes("UPDATE appointments")) {
        return { rows: [{ ok: true }] } as never;
      }
      if (s.includes("timezone")) {
        return { rows: [{ timezone: "Asia/Amman" }] } as never;
      }
      return { rows: [] } as never;
    });
    const args = baseArgs("نعم", {
      flow_step: "awaiting_cancel_confirm",
      pending_cancel_appointment_id: 501,
    });
    const result = await tryRulesEngineRoute(pool, args);
    expect(result).not.toBeNull();
  });
});
