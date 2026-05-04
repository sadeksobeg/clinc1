import { describe, it, expect } from "vitest";
import { decideAction } from "./decisionEngine";
import type { InterpretResult } from "@/lib/scheduling/types";

const base: Pick<
  InterpretResult,
  | "specialty"
  | "doctor_hint"
  | "clinic_hint"
  | "patient_name"
  | "confidence"
  | "source"
  | "needs_human"
  | "summary"
  | "action"
  | "required_slots"
  | "emergency"
  | "patient_context"
  | "booking_intent"
  | "reply_hint"
> = {
  specialty: null,
  doctor_hint: null,
  clinic_hint: null,
  patient_name: null,
  confidence: 0.8,
  source: "heuristic",
  needs_human: false,
  summary: null,
  action: null,
  required_slots: null,
  emergency: { detected: false, severity: 1 },
  patient_context: { known_patient: false },
  booking_intent: undefined,
  reply_hint: null,
};

describe("decideAction", () => {
  it("maps urgent intent to EMERGENCY with PRIORITIZE and AUTO_BOOK labels", () => {
    const interpret: InterpretResult = {
      ...base,
      intent: "urgent",
      urgency: "high",
      emergency: { detected: true, severity: 5 },
      urgency_level: "emergency",
    };
    const d = decideAction({ interpret, conversation_id: 1, patient_id: 2 });
    expect(d.type).toBe("EMERGENCY");
    expect(d.actions).toContain("PRIORITIZE");
    expect(d.actions).toContain("AUTO_BOOK");
    expect(d.priority).toBe(100);
  });

  it("maps emergency high-risk to EMERGENCY", () => {
    const interpret: InterpretResult = {
      ...base,
      intent: "booking",
      urgency: "high",
      emergency: { detected: true, severity: 4 },
      confidence: 0.9,
      urgency_level: "emergency",
    };
    const d = decideAction({ interpret, conversation_id: 1, patient_id: 2 });
    expect(d.type).toBe("EMERGENCY");
  });

  it("maps booking intent to BOOKING", () => {
    const interpret: InterpretResult = {
      ...base,
      intent: "booking",
      urgency: "normal",
      emergency: { detected: false, severity: 1 },
    };
    const d = decideAction({ interpret, conversation_id: 1, patient_id: 2 });
    expect(d.type).toBe("BOOKING");
    expect(d.actions).toContain("SUGGEST_SLOTS");
  });

  it("maps emergency risk >= 3.5 to prioritize without auto-book", () => {
    const interpret: InterpretResult = {
      ...base,
      intent: "urgent",
      urgency: "high",
      confidence: 0.9,
      emergency: { detected: true, severity: 4 },
    };
    const d = decideAction({ interpret, conversation_id: 1, patient_id: 2 });
    expect(d.type).toBe("EMERGENCY");
    expect(d.actions).toContain("PRIORITIZE");
    expect(d.actions).not.toContain("AUTO_BOOK");
  });

  it("routes uncertain high emergency to cautious UNKNOWN", () => {
    const interpret: InterpretResult = {
      ...base,
      intent: "emergency",
      urgency: "high",
      confidence: 0.6,
      emergency: { detected: true, severity: 4 },
    };
    const d = decideAction({ interpret, conversation_id: 1, patient_id: 2 });
    expect(d.type).toBe("UNKNOWN");
    expect(d.actions).toContain("PRIORITIZE");
    expect(d.actions).not.toContain("AUTO_BOOK");
    expect(d.reply_hint).toContain("قد تكون طارئة");
  });

  it("routes low-risk emergency signals to NORMAL safe mode", () => {
    const interpret: InterpretResult = {
      ...base,
      intent: "emergency",
      urgency: "high",
      confidence: 0.4,
      emergency: { detected: true, severity: 4 },
    };
    const d = decideAction({ interpret, conversation_id: 1, patient_id: 2 });
    expect(d.type).toBe("NORMAL");
    expect(d.reason).toContain("safe_mode");
  });

  it("clinical override: breathing_issue forces EMERGENCY regardless of risk thresholds", () => {
    const interpret: InterpretResult = {
      ...base,
      intent: "emergency",
      urgency: "medium",
      confidence: 0.8,
      emergency: { detected: true, severity: 3 },
      medical_signals: { breathing_issue: true },
    };
    const d = decideAction({ interpret, conversation_id: 1, patient_id: 2 });
    expect(d.type).toBe("EMERGENCY");
    expect(d.reason).toContain("clinical_override:breathing_issue");
  });

  it("blends emergency + booking signals into emergency with suggested slots", () => {
    const interpret: InterpretResult = {
      ...base,
      intent: "booking",
      urgency: "high",
      emergency: { detected: true, severity: 4 },
      booking_intent: { flexible: true },
      confidence: 0.9,
    };
    const d = decideAction({ interpret, conversation_id: 1, patient_id: 2 });
    expect(d.type).toBe("EMERGENCY");
    expect(d.actions).toContain("PRIORITIZE");
    expect(d.actions).toContain("SUGGEST_SLOTS");
  });

  it("maps question intent to NORMAL with reply_hint", () => {
    const interpret: InterpretResult = {
      ...base,
      intent: "question",
      urgency: "normal",
      emergency: { detected: false, severity: 1 },
    };
    const d = decideAction({ interpret, conversation_id: 1, patient_id: 2 });
    expect(d.type).toBe("NORMAL");
    expect(d.reply_hint).toBeTruthy();
  });

  it("maps unknown+needs_human to UNKNOWN", () => {
    const interpret: InterpretResult = {
      ...base,
      intent: "unknown",
      urgency: "normal",
      emergency: { detected: false, severity: 1 },
      needs_human: true,
    };
    const d = decideAction({ interpret, conversation_id: 1, patient_id: 2 });
    expect(d.type).toBe("UNKNOWN");
  });
});
