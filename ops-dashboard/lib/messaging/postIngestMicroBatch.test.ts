import { describe, expect, it } from "vitest";
import { createPostIngestJobV2 } from "./inboundDeferredQueue";
import { mergePostIngestJobGroup, parseAndMergePeekedTail } from "./postIngestMicroBatch";
import { serializePostIngestJobV2 } from "./inboundDeferredJobV2";

const minimalNorm = (text: string, messageId: string) => ({
  from: "x@c.us",
  to: "x@c.us",
  text,
  messageId,
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
});

const minimalCrm = (text: string, inbound_message_id: number) => ({
  is_duplicate: false,
  clinic_id: 1,
  patient_id: 2,
  patient_status: "new",
  patient_display_name: null as string | null,
  conversation_id: 9,
  inbound_message_id,
  conversation_state: "ACTIVE",
  from: "x@c.us",
  text,
  ruleIntent: "GENERAL",
  rulePriority: 4,
  ruleHandoff: false,
  fallbackReply: "ok",
  outsideHours: false,
  receivedAt: new Date().toISOString(),
  alertTo: "",
  dedupeHash: "h1",
  workflow_latency_ms: 1,
});

function makeJob(text: string, inbound_message_id: number, lane: "fast" | "slow" = "slow") {
  return createPostIngestJobV2({
    conversation_id: 9,
    clinic_id: 1,
    patient_id: 2,
    inbound_message_id,
    dedupeHash: `h${inbound_message_id}`,
    from: "x@c.us",
    text,
    crm: minimalCrm(text, inbound_message_id),
    norm: minimalNorm(text, `m${inbound_message_id}`),
    rawFlags: { execute_send: true },
    correlationId: "corr-1",
    priority: "normal",
    lane,
  });
}

describe("postIngestMicroBatch", () => {
  it("mergePostIngestJobGroup keeps newest ids and concatenates text by default", () => {
    process.env.INBOUND_MICRO_BATCH_TEXT_MODE = "concat";
    const a = makeJob("a", 1);
    const b = makeJob("b", 2);
    const m = mergePostIngestJobGroup([a, b]);
    expect(m.inbound_message_id).toBe(2);
    expect(m.text).toBe("a\nb");
    expect(m.crm.text).toBe("a\nb");
    expect(m.norm.text).toBe("a\nb");
    delete process.env.INBOUND_MICRO_BATCH_TEXT_MODE;
  });

  it("parseAndMergePeekedTail stops on invalid json", () => {
    const head = makeJob("x", 10);
    const bad = "not-json";
    const line = serializePostIngestJobV2(makeJob("y", 11));
    const r = parseAndMergePeekedTail(head, [bad, line]);
    expect(r.consumedTailCount).toBe(0);
    expect(r.job.text).toBe("x");
  });

  it("smart_last keeps last line as primary and preserves correction context", () => {
    process.env.INBOUND_MICRO_BATCH_TEXT_MODE = "smart_last";
    const a = makeJob("احجز عند دكتور الجلدية", 1);
    const b = makeJob("لا خليه دكتور الأسنان", 2);
    const m = mergePostIngestJobGroup([a, b]);
    expect(m.inbound_message_id).toBe(2);
    expect(m.text).toContain("لا خليه دكتور الأسنان");
    expect(m.text).toContain("احجز عند دكتور الجلدية");
    delete process.env.INBOUND_MICRO_BATCH_TEXT_MODE;
  });
});
