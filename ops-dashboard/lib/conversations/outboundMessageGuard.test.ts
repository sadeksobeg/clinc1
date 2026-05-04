import { describe, it, expect } from "vitest";
import { guardOutboundPatientText } from "./outboundMessageGuard";

describe("outboundMessageGuard", () => {
  it("blocks empty", async () => {
    const r = await guardOutboundPatientText({
      text: "   ",
      clinicId: 1,
      source: "test",
    });
    expect(r.action).toBe("block");
  });

  it("sanitizes URLs", async () => {
    const r = await guardOutboundPatientText({
      text: "راجع الرابط https://evil.test/x",
      clinicId: 1,
      source: "test",
    });
    expect(r.action).toBe("sanitize");
    if (r.action === "sanitize") {
      expect(r.text).toContain("[link removed]");
    }
  });
});
