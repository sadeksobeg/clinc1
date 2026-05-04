import { describe, expect, it } from "vitest";
import { createPostIngestJobV2 } from "./inboundDeferredQueue";
import {
  inferPostIngestLane,
  parsePostIngestJobV2,
  queuePriorityFromNorm,
  queuePriorityWithSla,
  serializePostIngestJobV2,
} from "./inboundDeferredJobV2";

const minimalNorm = {
  from: "x@c.us",
  to: "x@c.us",
  text: "hi",
  messageId: "m1",
  receivedAt: new Date().toISOString(),
  outsideHours: false,
  alertTo: "",
  dedupeHash: "h1",
  ruleIntent: "GENERAL" as const,
  rulePriority: 4,
  ruleHandoff: false,
  fallbackReply: "ok",
  clinic_id: 1,
  workflowStartedAt: Date.now(),
};

const minimalCrm = {
  is_duplicate: false,
  clinic_id: 1,
  patient_id: 2,
  patient_status: "new",
  patient_display_name: null as string | null,
  conversation_id: 9,
  inbound_message_id: 100,
  conversation_state: "ACTIVE",
  from: "x@c.us",
  text: "hi",
  ruleIntent: "GENERAL",
  rulePriority: 4,
  ruleHandoff: false,
  fallbackReply: "ok",
  outsideHours: false,
  receivedAt: new Date().toISOString(),
  alertTo: "",
  dedupeHash: "h1",
  workflow_latency_ms: 1,
};

describe("inboundDeferredJobV2", () => {
  it("roundtrips serialize and parse", () => {
    const job = createPostIngestJobV2({
      conversation_id: 9,
      clinic_id: 1,
      patient_id: 2,
      inbound_message_id: 100,
      dedupeHash: "h1",
      from: "x@c.us",
      text: "hi",
      crm: minimalCrm,
      norm: minimalNorm,
      rawFlags: { execute_send: true },
      correlationId: "corr-1",
      priority: "normal",
      lane: "fast",
      dialogue_version_snapshot: 7,
    });
    const line = serializePostIngestJobV2(job);
    const again = parsePostIngestJobV2(JSON.parse(line));
    expect(again).not.toBeNull();
    expect(again!.conversation_id).toBe(9);
    expect(again!.skip_ingest).toBe(true);
    expect(again!.v).toBe(2);
    expect(again!.correlationId).toBe("corr-1");
    expect(again!.lane).toBe("fast");
    expect(again!.dialogue_version_snapshot).toBe(7);
  });

  it("rejects v1-shaped payloads", () => {
    expect(parsePostIngestJobV2({ v: 1, enqueued_at: "", payload: {} })).toBeNull();
  });

  it("maps queue priority from rule intent", () => {
    expect(queuePriorityFromNorm("URGENT")).toBe("high");
    expect(queuePriorityFromNorm("PRICING")).toBe("low");
    expect(queuePriorityFromNorm("BOOKING")).toBe("normal");
  });

  it("queuePriorityWithSla upgrades configured clinics", () => {
    const prev = process.env.INBOUND_SLA_HIGH_PRIORITY_CLINIC_IDS;
    process.env.INBOUND_SLA_HIGH_PRIORITY_CLINIC_IDS = "99;100";
    expect(queuePriorityWithSla(100, "low")).toBe("high");
    expect(queuePriorityWithSla(1, "low")).toBe("low");
    if (prev === undefined) delete process.env.INBOUND_SLA_HIGH_PRIORITY_CLINIC_IDS;
    else process.env.INBOUND_SLA_HIGH_PRIORITY_CLINIC_IDS = prev;
  });

  it("inferPostIngestLane uses flow_step and Ollama presence", () => {
    const prevOllama = process.env.OLLAMA_URL;
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    expect(inferPostIngestLane({ ruleIntent: "GENERAL", textLength: 10, flowStep: "choose_clinic" })).toBe("fast");
    expect(inferPostIngestLane({ ruleIntent: "BOOKING", textLength: 5, flowStep: "idle" })).toBe("fast");
    expect(inferPostIngestLane({ ruleIntent: "GENERAL", textLength: 500, flowStep: "idle" })).toBe("slow");
    delete process.env.OLLAMA_URL;
    expect(inferPostIngestLane({ ruleIntent: "GENERAL", textLength: 500, flowStep: "idle" })).toBe("fast");
    if (prevOllama === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = prevOllama;
  });
});
