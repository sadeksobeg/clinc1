import { describe, expect, it } from "vitest";
import { applyIntentOverlayIfApplicable, textLooksLikeSmartLastMerge } from "./microBatchIntentOverlay";

describe("microBatchIntentOverlay", () => {
  it("detects smart_last shaped text via default separator", () => {
    const body = "احجز جلدية\n\n---\nلا خليه أسنان";
    expect(textLooksLikeSmartLastMerge(body)).toBe(true);
  });

  it("wraps context and last when INBOUND_INTENT_OVERLAY=1", () => {
    const prev = process.env.INBOUND_INTENT_OVERLAY;
    process.env.INBOUND_INTENT_OVERLAY = "1";
    const out = applyIntentOverlayIfApplicable("ctx\n\n---\nlastline");
    expect(out).toContain("[CTX]");
    expect(out).toContain("ctx");
    expect(out).toContain("[LAST]");
    expect(out).toContain("lastline");
    if (prev === undefined) delete process.env.INBOUND_INTENT_OVERLAY;
    else process.env.INBOUND_INTENT_OVERLAY = prev;
  });

  it("auto-wraps smart_last shape even without env when separator matches", () => {
    const prev = process.env.INBOUND_INTENT_OVERLAY;
    delete process.env.INBOUND_INTENT_OVERLAY;
    const out = applyIntentOverlayIfApplicable("a\n\n---\nb");
    expect(out).toContain("[LAST]");
    expect(out).toContain("b");
    if (prev !== undefined) process.env.INBOUND_INTENT_OVERLAY = prev;
  });
});
