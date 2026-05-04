import { describe, expect, it } from "vitest";
import { formatPatientContactLine, whatsappChatIdIsLid } from "@/lib/format";

describe("formatPatientContactLine", () => {
  it("prefers CRM phone_e164 over chat_id", () => {
    expect(formatPatientContactLine("+963953562654", "164965499543731@lid")).toBe("963953562654");
  });

  it("falls back to @c.us JID user part", () => {
    expect(formatPatientContactLine(null, "201234567890@c.us")).toBe("201234567890");
  });

  it("falls back to LID digits when no phone on file", () => {
    expect(formatPatientContactLine(null, "164965499543731@lid")).toBe("164965499543731");
  });
});

describe("whatsappChatIdIsLid", () => {
  it("detects LID suffix", () => {
    expect(whatsappChatIdIsLid("x@lid")).toBe(true);
    expect(whatsappChatIdIsLid("201@c.us")).toBe(false);
  });
});
