import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Pool } from "pg";
import {
  aiAnalysisToInterpretResult,
  getAIConfidenceThreshold,
  HeuristicAdapter,
  resetAIAdapterForTests,
  setConversationHandoffPending,
  type AIModelAdapter,
  type AIAnalysisResult,
} from "./AIModelAdapter";
import { interpretInboundHeuristic } from "@/lib/scheduling/interpret";

const baseInput = {
  text: "أريد موعد مع دكتور قلب",
  conversationHistory: [] as Array<{ role: "patient" | "system"; text: string; at: Date }>,
  patient: { name: "أحمد", visitCount: 1, tags: [] },
  availableServices: [{ name: "cardiology", doctors: ["د. سامي"] }],
  clinicId: 1,
  language: "ar" as const,
};

describe("AIModelAdapter", () => {
  beforeEach(() => {
    resetAIAdapterForTests();
  });

  afterEach(() => {
    resetAIAdapterForTests();
    vi.restoreAllMocks();
  });

  it("maps low-confidence external result — caller should fall back to heuristic interpret", async () => {
    const lowConf: AIAnalysisResult = {
      intent: "booking",
      entities: {},
      suggested_reply: "test",
      confidence: 0.3,
      needs_human: false,
    };
    const threshold = getAIConfidenceThreshold();
    expect(lowConf.confidence).toBeLessThanOrEqual(threshold);

    const int = interpretInboundHeuristic(baseInput.text);
    expect(int.intent).toBe("booking");
    expect(int.source).toBe("heuristic");
  });

  it("aiAnalysisToInterpretResult preserves booking intent at high confidence", () => {
    const ai: AIAnalysisResult = {
      intent: "booking",
      entities: { doctor_name: "د. سامي", specialty: "cardiology", time: "11:00" },
      suggested_reply: "موعدك متاح",
      confidence: 0.9,
      needs_human: false,
    };
    const int = aiAnalysisToInterpretResult(ai, "external_ai");
    expect(int.intent).toBe("booking");
    expect(int.confidence).toBe(0.9);
    expect(int.doctor_hint).toBe("د. سامي");
  });

  it("setConversationHandoffPending updates state and handoff_reason", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    await setConversationHandoffPending(pool, 42, 1, "يحتاج مراجعة بشرية");
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("PENDING_HANDOFF");
    expect(sql).toContain("handoff_reason");
    expect(query.mock.calls[0][1]).toEqual(
      expect.arrayContaining([42, "يحتاج مراجعة بشرية", expect.any(String), 1]),
    );
  });

  it("HeuristicAdapter throws are not used when mock adapter throws — fallback uses interpretInboundHeuristic", async () => {
    const throwing: AIModelAdapter = {
      isAvailable: async () => true,
      analyze: async () => {
        throw new Error("external_down");
      },
    };
    resetAIAdapterForTests(throwing);
    let caught = false;
    try {
      await throwing.analyze(baseInput);
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
    const fallback = interpretInboundHeuristic(baseInput.text);
    expect(fallback.intent).toBeTruthy();
  });

  it("needs_human maps to interpret with needs_human flag", () => {
    const ai: AIAnalysisResult = {
      intent: "complaint",
      entities: {},
      suggested_reply: "",
      confidence: 0.95,
      needs_human: true,
      needs_human_reason: "شكوى حساسة",
    };
    const int = aiAnalysisToInterpretResult(ai, "external_ai");
    expect(int.needs_human).toBe(true);
    expect(int.summary).toBe("شكوى حساسة");
  });
});
