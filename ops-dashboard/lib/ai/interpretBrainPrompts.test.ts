import { describe, it, expect } from "vitest";
import { buildBrainUserPrompt } from "./interpretBrainPrompts";
import { normalizeRawIntent, isComplaintIntent } from "@/lib/scheduling/interpret";

describe("buildBrainUserPrompt", () => {
  it("includes clinics, doctors, and working hours sections", () => {
    const s = buildBrainUserPrompt({
      message: "بدي موعد",
      conversationState: { step: "idle" },
      routing: { clinic_id: 1 },
      knownEntities: { patient_id: 9 },
      clinics: [
        { id: 1, name: "Clinic A" },
        { id: 2, name: "Clinic B" },
      ],
      doctors: [{ id: 10, name: "د. أحمد", specialty: "general" }],
      workingHoursLines: ["weekday 0: 09:00-17:00", "weekday 1: closed"],
    });
    expect(s).toContain("User message:");
    expect(s).toContain("بدي موعد");
    expect(s).toContain("Clinics (top list");
    expect(s).toContain("1: Clinic A");
    expect(s).toContain("Doctors (top list");
    expect(s).toContain("10: د. أحمد");
    expect(s).toContain("Working hours (weekday summary):");
    expect(s).toContain("weekday 1: closed");
    expect(s).toContain("Conversation state:");
    expect(s).toContain("Routing:");
    expect(s).toContain("Known data:");
  });

  it("truncates very long user messages", () => {
    const long = "x".repeat(5000);
    const s = buildBrainUserPrompt({ message: long });
    expect(s.length).toBeLessThan(long.length + 500);
    const lines = s.split("\n");
    expect(lines[0]).toBe("User message:");
    expect(lines[1]?.length).toBeLessThanOrEqual(2000);
  });
});

describe("normalizeRawIntent + complaint flag", () => {
  it("maps inquiry → question and book → booking", () => {
    expect(normalizeRawIntent("inquiry")).toBe("question");
    expect(normalizeRawIntent("book")).toBe("booking");
  });

  it("flags complaint for merge path", () => {
    expect(isComplaintIntent("complaint")).toBe(true);
    expect(isComplaintIntent("COMPLAINT")).toBe(true);
    expect(isComplaintIntent("booking")).toBe(false);
  });
});
