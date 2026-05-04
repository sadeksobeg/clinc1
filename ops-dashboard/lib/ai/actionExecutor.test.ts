import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Pool } from "pg";
import { executeDecision } from "./actionExecutor";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";
import { resetProductMetricsForTests, getProductMetricsSnapshot } from "@/lib/observability/productMetrics";
import type { InterpretResult } from "@/lib/scheduling/types";
import type { Decision } from "./decisionEngine";

const crmBase: InboundIngestRow = {
  is_duplicate: false,
  clinic_id: 1,
  patient_id: 9,
  patient_status: "active",
  patient_display_name: "Test",
  conversation_id: 42,
  inbound_message_id: 1001,
  conversation_state: "ACTIVE",
  from: "whatsapp",
  text: "hi",
  ruleIntent: "GENERAL",
  rulePriority: 4,
  ruleHandoff: false,
  fallbackReply: "",
  outsideHours: false,
  receivedAt: new Date().toISOString(),
  alertTo: "",
  dedupeHash: "x",
  workflow_latency_ms: 0,
};

const interpret: InterpretResult = {
  intent: "question",
  specialty: null,
  doctor_hint: null,
  clinic_hint: null,
  patient_name: null,
  urgency: "normal",
  emergency: { detected: false, severity: 1 },
  patient_context: { known_patient: false },
  booking_intent: undefined,
  reply_hint: null,
  confidence: 0.5,
  source: "heuristic",
  needs_human: false,
  summary: null,
  action: null,
  required_slots: null,
};

const decision: Decision = {
  type: "NORMAL",
  actions: ["PRIORITIZE", "SEND_REPLY"],
  priority: 10,
  reason: "test",
  reply_hint: "hint",
};

describe("executeDecision", () => {
  const prevEngine = process.env.INBOUND_DECISION_ENGINE;

  beforeEach(() => {
    resetProductMetricsForTests();
    process.env.INBOUND_DECISION_ENGINE = "1";
  });

  afterEach(() => {
    if (prevEngine === undefined) delete process.env.INBOUND_DECISION_ENGINE;
    else process.env.INBOUND_DECISION_ENGINE = prevEngine;
    resetProductMetricsForTests();
  });

  it("updates routing on first call and skips duplicate work for same inbound_message_id", async () => {
    const updates: unknown[][] = [];
    const pool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (String(sql).includes("SELECT routing->'last_decision'")) {
          return { rows: [{ lid: updates.length > 0 ? String(crmBase.inbound_message_id) : null }] };
        }
        if (String(sql).includes("UPDATE conversations")) {
          updates.push(params ?? []);
          return { rowCount: 1, rows: [] };
        }
        return { rows: [] };
      }),
    } as unknown as Pool;

    const ctx = { pool, crm: { ...crmBase }, interpret };
    const a = await executeDecision(ctx, decision);
    expect(a.skipped_duplicate).toBe(false);
    const b = await executeDecision(ctx, decision);
    expect(b.skipped_duplicate).toBe(true);
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3);
    const snap = getProductMetricsSnapshot();
    expect(snap.process_inbound_decision_idempotent_skip_total).toBeGreaterThanOrEqual(1);
  });

  it("increments auto_book_skipped when AUTO_BOOK is present", async () => {
    process.env.INBOUND_DECISION_ENGINE = "1";
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (String(sql).includes("SELECT routing->'last_decision'")) {
          return { rows: [{ lid: null }] };
        }
        if (String(sql).includes("UPDATE conversations")) {
          return { rowCount: 1, rows: [] };
        }
        return { rows: [] };
      }),
    } as unknown as Pool;

    const dec: Decision = {
      ...decision,
      actions: ["AUTO_BOOK"],
    };
    await executeDecision({ pool, crm: { ...crmBase, inbound_message_id: 2002 }, interpret }, dec);
    expect(getProductMetricsSnapshot().process_inbound_auto_book_skipped_total).toBe(1);
  });
});
