import { describe, expect, it } from "vitest";
import { computeInboundEventId } from "./computeInboundEventId";

describe("computeInboundEventId", () => {
  it("is stable for same inputs", () => {
    const a = computeInboundEventId({
      clinic_id: 1,
      conversation_id: 2,
      dedupe_hash: "h",
      inbound_message_id: 99,
      message_id: "wamid.x",
    });
    const b = computeInboundEventId({
      clinic_id: 1,
      conversation_id: 2,
      dedupe_hash: "h",
      inbound_message_id: 99,
      message_id: "wamid.x",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when any segment changes", () => {
    const base = {
      clinic_id: 1,
      conversation_id: 2,
      dedupe_hash: "h",
      inbound_message_id: 99,
      message_id: "wamid.x",
    };
    const x = computeInboundEventId(base);
    expect(computeInboundEventId({ ...base, clinic_id: 2 })).not.toBe(x);
    expect(computeInboundEventId({ ...base, conversation_id: 3 })).not.toBe(x);
    expect(computeInboundEventId({ ...base, dedupe_hash: "z" })).not.toBe(x);
    expect(computeInboundEventId({ ...base, inbound_message_id: 100 })).not.toBe(x);
    expect(computeInboundEventId({ ...base, message_id: "other" })).not.toBe(x);
  });
});
