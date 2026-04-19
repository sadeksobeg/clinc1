import { describe, expect, it } from "vitest";
import { detectTimePreference, filterSlotsByTimePreference } from "./timePreference";

describe("detectTimePreference", () => {
  it("detects morning hints", () => {
    expect(detectTimePreference("بدي موعد بكير")).toBe("morning");
    expect(detectTimePreference("صباحاً لو سمحت")).toBe("morning");
  });

  it("detects afternoon hints", () => {
    expect(detectTimePreference("بعد الضهر")).toBe("afternoon");
    expect(detectTimePreference("مساء")).toBe("afternoon");
  });

  it("detects any-time hints", () => {
    expect(detectTimePreference("أي وقت يكون فاضي")).toBe("any");
  });

  it("returns null when no hint", () => {
    expect(detectTimePreference("بدي دكتور جلدية")).toBeNull();
  });
});

describe("filterSlotsByTimePreference", () => {
  it("filters by local morning window (Asia/Amman)", () => {
    const slots = [
      { starts_at: "2026-04-20T06:00:00.000Z", ends_at: "2026-04-20T06:15:00.000Z", doctor_id: 1, doctor_name: "A" },
      { starts_at: "2026-04-20T14:00:00.000Z", ends_at: "2026-04-20T14:15:00.000Z", doctor_id: 1, doctor_name: "A" },
    ];
    const m = filterSlotsByTimePreference(slots, "Asia/Amman", "morning");
    expect(m.length).toBe(1);
    expect(m[0]!.starts_at).toBe(slots[0]!.starts_at);
  });
});
