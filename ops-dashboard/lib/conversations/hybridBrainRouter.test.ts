import { describe, expect, it } from "vitest";
import {
  enrichInterpretForRouting,
  isNumericMainMenuChoice,
  routeInterpretToHybridAction,
  HYBRID_BOOKING_CONFIDENCE,
} from "./hybridBrainRouter";
import type { InterpretResult } from "@/lib/scheduling/types";
import type { NormalizedInboundRules } from "./normalizeInbound";

function baseInterpret(overrides: Partial<InterpretResult> = {}): InterpretResult {
  return {
    intent: "unknown",
    specialty: null,
    doctor_hint: null,
    clinic_hint: null,
    patient_name: null,
    urgency: "normal",
    emergency: { detected: false, severity: 1 },
    patient_context: { known_patient: false },
    confidence: 0.5,
    source: "heuristic",
    needs_human: false,
    summary: null,
    ...overrides,
  };
}

function norm(text: string, ruleIntent: NormalizedInboundRules["ruleIntent"] = "GENERAL"): NormalizedInboundRules {
  return {
    text,
    ruleIntent,
    alertTo: "",
    workflowStartedAt: Date.now(),
  } as NormalizedInboundRules;
}

describe("hybridBrainRouter", () => {
  it("isNumericMainMenuChoice detects 1-3 and 0", () => {
    expect(isNumericMainMenuChoice("1")).toBe(true);
    expect(isNumericMainMenuChoice(" 2 ")).toBe(true);
    expect(isNumericMainMenuChoice("مرحبا")).toBe(false);
  });

  it("enrichInterpretForRouting maps عيون to ophthalm slug", () => {
    const int = enrichInterpretForRouting(baseInterpret(), "بدي طبيب عيون بكرا");
    expect(int.specialty).toBe("ophthalm");
  });

  it("routes pricing inquiry to consumed pricing turn", () => {
    const int = baseInterpret({ intent: "question", confidence: 0.8 });
    const r = routeInterpretToHybridAction(int, norm("كم سعر الكشفية عند د. سامي؟"), "كم سعر الكشفية عند د. سامي؟");
    expect(r?.action).toBe("consumed");
    if (r?.action === "consumed") {
      expect(r.turn.finalIntent).toBe("PRICING");
    }
  });

  it("routes child fever symptoms to handoff", () => {
    const int = baseInterpret({
      intent: "question",
      confidence: 0.7,
      medical_signals: { infection_signs: true },
      needs_human: true,
    });
    const r = routeInterpretToHybridAction(int, norm("ابني عنده حرارة وكحة"), "ابني عنده حرارة وكحة");
    expect(r?.action).toBe("handoff");
  });

  it("routes booking with specialty to null (start booking in caller)", () => {
    const int = baseInterpret({
      intent: "booking",
      confidence: HYBRID_BOOKING_CONFIDENCE + 0.1,
      specialty: "ophthalmology",
    });
    const r = routeInterpretToHybridAction(int, norm("بدي طبيب عيون بكرا"), "بدي طبيب عيون بكرا");
    expect(r).toBeNull();
  });

  it("routes emergency to continue", () => {
    const int = baseInterpret({
      intent: "emergency",
      confidence: 0.9,
      emergency: { detected: true, severity: 5 },
    });
    const r = routeInterpretToHybridAction(int, norm("نزيف"), "نزيف");
    expect(r?.action).toBe("continue");
  });

  it("plan examples: pricing / symptoms / eye doctor routing", () => {
    const pricing = routeInterpretToHybridAction(
      baseInterpret({ intent: "question", confidence: 0.75 }),
      norm("كم سعر الكشفية عند د. سامي؟"),
      "كم سعر الكشفية عند د. سامي؟",
    );
    expect(pricing?.action).toBe("consumed");

    const symptoms = routeInterpretToHybridAction(
      baseInterpret({ intent: "unknown", confidence: 0.6, needs_human: true }),
      norm("ابني عنده حرارة وكحة"),
      "ابني عنده حرارة وكحة",
    );
    expect(symptoms?.action).toBe("handoff");

    const enriched = enrichInterpretForRouting(
      baseInterpret({ intent: "booking", confidence: 0.8 }),
      "بدي طبيب عيون بكرا",
    );
    expect(enriched.specialty).toBe("ophthalm");
    const booking = routeInterpretToHybridAction(enriched, norm("بدي طبيب عيون بكرا"), "بدي طبيب عيون بكرا");
    expect(booking).toBeNull();
  });
});
