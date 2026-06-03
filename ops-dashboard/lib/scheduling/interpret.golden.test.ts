import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { interpretInboundText, parseOllamaContent } from "./interpret";

describe("interpretInboundText heuristic (no OLLAMA_URL)", () => {
  const prevUrl = process.env.OLLAMA_URL;
  const prevModel = process.env.OLLAMA_MODEL;

  beforeEach(() => {
    delete process.env.OLLAMA_URL;
    process.env.OLLAMA_MODEL = "qwen2.5:3b";
  });

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = prevUrl;
    if (prevModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = prevModel;
  });

  it("detects booking + pediatrics from child + fever phrasing", async () => {
    const r = await interpretInboundText("بنتي عندها حرارة من امبارح وبدي موعد اليوم");
    expect(r.intent).toBe("booking");
    expect(r.specialty).toBe("pediatrics");
    expect(r.source).toBe("heuristic");
    expect(r.summary).toBeTruthy();
  });

  it("detects urgent keywords", async () => {
    const r = await interpretInboundText("في طوارئ نزيف");
    expect(r.intent).toBe("emergency");
    expect(r.urgency).toBe("critical");
    expect(r.emergency.detected).toBe(true);
    expect(r.emergency.severity).toBe(5);
    expect(r.urgency_level).toBe("emergency");
    expect(r.action).toBe("emergency_override");
  });

  it("keeps booking_intent when message is both emergency and booking", async () => {
    const r = await interpretInboundText("عندي ألم شديد وبدي موعد اليوم");
    expect(r.emergency.detected).toBe(true);
    expect(r.emergency.severity).toBeGreaterThanOrEqual(4);
    expect(r.booking_intent?.flexible).toBe(true);
    expect(r.medical_signals?.severe_pain).toBe(true);
  });

  it("extracts breathing issue signal semantically in heuristic path", async () => {
    const r = await interpretInboundText("أمي مو قادرة تتنفس كويس من الصبح");
    expect(r.medical_signals?.breathing_issue).toBe(true);
    expect(r.emergency.detected).toBe(true);
  });

  it("detects cancel", async () => {
    const r = await interpretInboundText("بدي إلغاء الموعد");
    expect(r.intent).toBe("cancel");
  });

  it("marks long unknown as needs_human", async () => {
    const long = "أهلا في عندي استفسار عن الوضع الصحي والتفاصيل الدقيقة للعلاج والمتابعة لاحقًا".repeat(2);
    const r = await interpretInboundText(long);
    expect(r.intent).toBe("unknown");
    expect(r.needs_human).toBe(true);
  });

});

describe("parseOllamaContent Zod validation", () => {
  it("accepts full valid JSON", () => {
    const raw = JSON.stringify({
      intent: "booking",
      specialty: "pediatrics",
      doctor_hint: null,
      urgency: "normal",
      urgency_level: "priority",
      action: "continue_booking",
      required_slots: 1,
      confidence: 0.88,
      needs_human: false,
      summary: "طفلة لديها حرارة وتطلب موعدًا اليوم",
    });
    const r = parseOllamaContent(raw, "بنتي عندها حرارة");
    expect(r).not.toBeNull();
    expect(r!.intent).toBe("booking");
    expect(r!.specialty).toBe("pediatrics");
    expect(r!.source).toBe("ollama");
    expect(r!.summary).toContain("حرارة");
    expect(r!.clinic_hint).toBeNull();
    expect(r!.patient_name).toBeNull();
    expect(r!.urgency_level).toBe("priority");
    expect(r!.required_slots).toBe(1);
    expect(r!.emergency.detected).toBe(false);
  });

  it("parses system_event payload", () => {
    const raw = JSON.stringify({
      intent: "urgent",
      urgency: "high",
      urgency_level: "emergency",
      action: "emergency_override",
      system_event: {
        type: "system_event",
        event: "emergency_override",
        context: { reason: "bleeding", priority: "high" },
      },
      confidence: 0.95,
      needs_human: false,
    });
    const r = parseOllamaContent(raw, "نزيف حاد");
    expect(r).not.toBeNull();
    expect(r!.system_event?.type).toBe("system_event");
    expect(r!.system_event?.event).toBe("emergency_override");
    expect(r!.urgency_level).toBe("emergency");
  });

  it("passes through clinic_hint and patient_name from model JSON", () => {
    const raw = JSON.stringify({
      intent: "booking",
      specialty: "ophthalmology",
      clinic_hint: null,
      patient_name: "احمد",
      doctor_hint: "عيون",
      urgency: "normal",
      confidence: 0.9,
      needs_human: false,
      summary: "حجز غد",
    });
    const r = parseOllamaContent(raw, "مرحبا بدي احجز عند دكتور عيون بكرا اسمي احمد");
    expect(r).not.toBeNull();
    expect(r!.patient_name).toBe("احمد");
    expect(r!.intent).toBe("booking");
  });

  it("parses v2 emergency and booking_intent fields", () => {
    const raw = JSON.stringify({
      intent: "booking",
      urgency: "high",
      confidence: 0.86,
      emergency: { detected: true, severity: 4, reason: "severe_pain" },
      booking_intent: { requested_time: "today", flexible: false },
      patient_context: { known_patient: true, name: "سارة" },
      reply_hint: "سنؤمّن أقرب موعد بأولوية.",
    });
    const r = parseOllamaContent(raw, "ألم شديد بدي موعد اليوم");
    expect(r).not.toBeNull();
    expect(r!.emergency.detected).toBe(true);
    expect(r!.emergency.severity).toBe(4);
    expect(r!.booking_intent?.flexible).toBe(false);
    expect(r!.patient_context.known_patient).toBe(true);
    expect(r!.reply_hint).toContain("أولوية");
  });

  it("parses medical_signals from model JSON", () => {
    const raw = JSON.stringify({
      intent: "emergency",
      confidence: 0.8,
      urgency: "high",
      emergency: { detected: true, severity: 4, reason: "respiratory_distress" },
      medical_signals: { breathing_issue: true, severe_pain: false, bleeding: false },
    });
    const r = parseOllamaContent(raw, "ما بقدر أتنفس");
    expect(r).not.toBeNull();
    expect(r!.medical_signals?.breathing_issue).toBe(true);
    expect(r!.medical_signals?.bleeding).toBe(false);
  });

  it("normalizes unrecognized model intent to unknown (loose Zod + normalize)", () => {
    const r = parseOllamaContent(JSON.stringify({ intent: "not_a_canonical_intent", confidence: 1 }), "x");
    expect(r).not.toBeNull();
    expect(r!.intent).toBe("unknown");
  });

  it("normalizes inquiry to question", () => {
    const r = parseOllamaContent(JSON.stringify({ intent: "inquiry", confidence: 0.9 }), "استفسار");
    expect(r).not.toBeNull();
    expect(r!.intent).toBe("question");
  });

  it("rejects non-object JSON", () => {
    expect(parseOllamaContent("[1,2]", "x")).toBeNull();
    expect(parseOllamaContent("not json", "x")).toBeNull();
  });
});
