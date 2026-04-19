import { describe, expect, it } from "vitest";
import { normalizeArabicIndicDigits, parseDialogueState, parseListSelection1Based } from "./dialogueParse";

describe("parseListSelection1Based", () => {
  it("parses western digits", () => {
    expect(parseListSelection1Based("1", 3)).toBe(1);
    expect(parseListSelection1Based("أريد 2", 3)).toBe(2);
    expect(parseListSelection1Based("3", 2)).toBeNull();
  });

  it("parses Arabic-indic digits", () => {
    expect(parseListSelection1Based("٢", 5)).toBe(2);
    expect(parseListSelection1Based("الخيار ٣", 5)).toBe(3);
  });

  it("normalizes Arabic-indic string", () => {
    expect(normalizeArabicIndicDigits("٣")).toBe("3");
  });
});

describe("parseDialogueState", () => {
  it("reads consecutive_unparsed and time_pref", () => {
    const d = parseDialogueState({
      flow_step: "slot_offer",
      consecutive_unparsed: 2,
      time_pref: "morning",
    });
    expect(d.consecutive_unparsed).toBe(2);
    expect(d.time_pref).toBe("morning");
  });

  it("defaults consecutive_unparsed to 0", () => {
    const d = parseDialogueState({ flow_step: "idle" });
    expect(d.consecutive_unparsed).toBe(0);
  });
});
