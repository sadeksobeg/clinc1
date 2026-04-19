import { describe, expect, it } from "vitest";
import { mergePreambleAndReply } from "@/lib/conversations/pendingCoalesce";
import { isRecentPatientInbound } from "./replyWindow";

describe("isRecentPatientInbound", () => {
  it("returns false when last inbound is older than 15 minutes", () => {
    const last = new Date(Date.now() - 20 * 60 * 1000);
    expect(isRecentPatientInbound(last)).toBe(false);
  });

  it("returns true when last inbound is recent", () => {
    const last = new Date(Date.now() - 60 * 1000);
    expect(isRecentPatientInbound(last)).toBe(true);
  });

  it("returns false when null", () => {
    expect(isRecentPatientInbound(null)).toBe(false);
  });
});

describe("mergePreambleAndReply", () => {
  it("joins preamble then reply", () => {
    const out = mergePreambleAndReply(["تذكير: موعد"], "رد على سؤالك");
    expect(out).toContain("تذكير");
    expect(out).toContain("رد على سؤالك");
  });
});
