import { describe, it, expect } from "vitest";
import { guardPatientFacingDecision } from "./patientSafetyGuard";
import type { InterpretResult } from "@/lib/scheduling/types";
import type { Decision } from "./decisionEngine";

const baseInterpret = (): InterpretResult => ({
  intent: "question",
  specialty: null,
  doctor_hint: null,
  clinic_hint: null,
  patient_name: null,
  urgency: "normal",
  emergency: { detected: false, severity: 1 },
  patient_context: { known_patient: true },
  confidence: 0.5,
  source: "heuristic",
  needs_human: false,
  summary: null,
  system_event: null,
});

describe("patientSafetyGuard", () => {
  it("allows safe decisions", () => {
    const decision: Decision = {
      type: "NORMAL",
      actions: ["SEND_REPLY"],
      priority: 2,
      reason: "ok",
      reply_hint: "يمكنك زيارة العيادة في أوقات الدوام.",
    };
    const r = guardPatientFacingDecision(decision, baseInterpret());
    expect(r.ok).toBe(true);
  });

  it("blocks prescribing-style hints", () => {
    const decision: Decision = {
      type: "NORMAL",
      actions: ["SEND_REPLY"],
      priority: 2,
      reason: "bad",
      reply_hint: "خذ مضاد حيوي 500mg مرتين يومياً.",
    };
    const r = guardPatientFacingDecision(decision, baseInterpret());
    expect(r.ok).toBe(false);
    expect(r.handoffDecision.reply_hint).toBeNull();
    expect(r.handoffDecision.actions).toContain("PRIORITIZE");
  });
});
