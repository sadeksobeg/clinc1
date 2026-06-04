import { z } from "zod";
import { ollamaJsonChat } from "@/lib/ai/ollamaJsonChat";
import { incProductMetric } from "@/lib/observability/productMetrics";
import { BRAIN_SYSTEM_PROMPT, buildBrainUserPrompt, type BrainPromptInput } from "@/lib/ai/interpretBrainPrompts";
import type { InterpretResult } from "./types";

const BOOKING = [
  "حجز",
  "موعد",
  "appointment",
  "book",
  "reserve",
  "بدي موعد",
  "كشفية",
  "احجز",
  "احجزلي",
];
const CANCEL = ["إلغاء", "الغاء", "cancel"];
const RESCHEDULE = ["تأجيل", "تاجيل", "reschedule", "غير الموعد"];
const URGENT = ["طوارئ", "نزيف", "ألم شديد", "الم شديد", "urgent", "emergency", "اسعاف", "حرارة شديدة", "ما بتنفس"];
const CRITICAL_URGENT = ["اسعاف", "نزيف", "اختناق", "ما بتنفس", "لا يستطيع التنفس", "فقدان وعي"];
const HIGH_URGENT = ["ألم شديد", "الم شديد", "حالة خطيرة", "طارئ", "طوارئ", "حادث", "حرارة شديدة"];
const BREATHING_SIGNS = [
  "ما بتنفس",
  "لا يستطيع التنفس",
  "صعوبة تنفس",
  "يتنفس بسرعة",
  "تتنفس",
  "تنفس",
  "breath",
  "shortness of breath",
];
const BLEEDING_SIGNS = ["نزيف", "دم ما بوقف", "ينزف", "bleeding"];
const SEVERE_PAIN_SIGNS = ["ألم شديد", "الم شديد", "لا أتحمل", "cannot tolerate pain", "severe pain"];
const LOC_SIGNS = ["فقدان وعي", "اغماء", "مغمى", "unconscious"];
const TRAUMA_SIGNS = ["حادث", "ضربة قوية", "كسر", "trauma", "injury"];
const INFECTION_SIGNS = ["حرارة شديدة", "حمى عالية", "التهاب شديد", "عدوى", "infection"];
const MOBILITY_SIGNS = ["ما بقدر امشي", "لا يستطيع الحركة", "صعوبة حركة", "mobility"];
const PSYCH_SIGNS = ["خوف شديد", "هلع", "panic", "انهيار نفسي", "distress"];

const urgencyEnum = z.enum(["low", "normal", "medium", "high", "critical"]);
const urgencyLevelEnum = z.enum(["normal", "priority", "emergency"]);
const severityEnum = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

/** Optional context from process-inbound (top-N lists, dialogue snapshot). */
export type InterpretBrainContext = {
  dialogueState?: unknown;
  routing?: Record<string, unknown>;
  knownEntities?: Record<string, unknown> | null;
  clinics?: Array<{ id: number; name: string }>;
  doctors?: Array<{ id: number; name: string; specialty?: string | null }>;
  workingHoursLines?: string[];
};

/** Loose model output (3B may use synonyms); normalized before merge. */
const ollamaBrainRawSchema = z.object({
  intent: z.string().optional(),
  specialty: z.union([z.string(), z.null()]).optional(),
  doctor_hint: z.union([z.string(), z.null()]).optional(),
  clinic_hint: z.union([z.string(), z.null()]).optional(),
  patient_name: z.union([z.string(), z.null()]).optional(),
  preferred_time: z.union([z.string(), z.null()]).optional(),
  symptoms: z.union([z.string(), z.null()]).optional(),
  urgency: z.union([urgencyEnum, z.null()]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  needs_human: z.boolean().optional(),
  response_text: z.union([z.string(), z.null()]).optional(),
  next_state: z.union([z.string(), z.null()]).optional(),
  summary: z.union([z.string(), z.null()]).optional(),
  urgency_level: z.union([urgencyLevelEnum, z.null()]).optional(),
  action: z.union([z.string(), z.null()]).optional(),
  required_slots: z.union([z.number().int().min(1), z.null()]).optional(),
  emergency: z
    .object({
      detected: z.boolean(),
      severity: severityEnum,
      reason: z.union([z.string(), z.null()]).optional(),
    })
    .optional(),
  medical_signals: z
    .object({
      breathing_issue: z.boolean().optional(),
      bleeding: z.boolean().optional(),
      severe_pain: z.boolean().optional(),
      loss_of_consciousness: z.boolean().optional(),
      trauma: z.boolean().optional(),
      infection_signs: z.boolean().optional(),
      mobility_issue: z.boolean().optional(),
      psychological_distress: z.boolean().optional(),
    })
    .optional(),
  booking_intent: z
    .object({
      requested_time: z.union([z.string(), z.null()]).optional(),
      flexible: z.boolean().optional(),
    })
    .optional(),
  patient_context: z
    .object({
      known_patient: z.boolean().optional(),
      name: z.union([z.string(), z.null()]).optional(),
      is_child: z.boolean().optional(),
      is_elderly: z.boolean().optional(),
      chronic_condition: z.boolean().optional(),
    })
    .optional(),
  reply_hint: z.union([z.string(), z.null()]).optional(),
  system_event: z
    .union([
      z.object({
        type: z.literal("system_event"),
        event: z.string().min(1),
        context: z.record(z.unknown()).optional().nullable(),
      }),
      z.null(),
    ])
    .optional(),
});

const canonicalIntents = new Set<InterpretResult["intent"]>([
  "booking",
  "cancel",
  "reschedule",
  "urgent",
  "emergency",
  "question",
  "followup",
  "info",
  "complaint",
  "unknown",
]);

/**
 * Map model intent strings to InterpretResult intents.
 * complaint → unknown + caller should force needs_human in merge.
 */
export function normalizeRawIntent(raw: string | undefined): InterpretResult["intent"] {
  const t = (raw || "").trim().toLowerCase();
  if (t === "book") return "booking";
  if (t === "inquiry") return "question";
  if (t === "faq" || t === "information") return "info";
  if (t === "follow_up" || t === "follow-up") return "followup";
  if (t === "complaint") return "complaint";
  if (canonicalIntents.has(t as InterpretResult["intent"])) return t as InterpretResult["intent"];
  return "unknown";
}

export function isComplaintIntent(raw: string | undefined): boolean {
  return (raw || "").trim().toLowerCase() === "complaint";
}

/** Internal shape after normalization (matches previous merge input). */
type NormalizedBrainFields = {
  intent: InterpretResult["intent"];
  specialty: string | null | undefined;
  doctor_hint: string | null | undefined;
  clinic_hint: string | null | undefined;
  patient_name: string | null | undefined;
  urgency: z.infer<typeof urgencyEnum> | undefined | null;
  confidence: number | undefined;
  needs_human: boolean | undefined;
  summary: string | null | undefined;
  urgency_level: z.infer<typeof urgencyLevelEnum> | undefined | null;
  action: string | null | undefined;
  required_slots: number | null | undefined;
  emergency:
    | {
        detected: boolean;
        severity: 1 | 2 | 3 | 4 | 5;
        reason?: string | null;
      }
    | undefined;
  medical_signals:
    | {
        breathing_issue?: boolean;
        bleeding?: boolean;
        severe_pain?: boolean;
        loss_of_consciousness?: boolean;
        trauma?: boolean;
        infection_signs?: boolean;
        mobility_issue?: boolean;
        psychological_distress?: boolean;
      }
    | undefined;
  booking_intent:
    | {
        requested_time?: string | null;
        flexible?: boolean;
      }
    | undefined;
  patient_context:
    | {
        known_patient?: boolean;
        name?: string | null;
        is_child?: boolean;
        is_elderly?: boolean;
        chronic_condition?: boolean;
      }
    | undefined;
  reply_hint: string | null | undefined;
  system_event:
    | {
        type: "system_event";
        event: string;
        context?: Record<string, unknown> | null;
      }
    | null
    | undefined;
};

function clipSummary(text: string, max = 160): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function urgencyFromSeverity(severity: number): InterpretResult["urgency"] {
  if (severity >= 5) return "critical";
  if (severity >= 4) return "high";
  if (severity >= 3) return "medium";
  if (severity <= 1) return "low";
  return "normal";
}

function heuristicEmergency(textLower: string): { detected: boolean; severity: 1 | 2 | 3 | 4 | 5; reason?: string } {
  const hasAnyUrgent = URGENT.some((w) => textLower.includes(w.toLowerCase()));
  if (!hasAnyUrgent) return { detected: false, severity: 1 };
  if (CRITICAL_URGENT.some((w) => textLower.includes(w.toLowerCase()))) {
    return { detected: true, severity: 5, reason: "critical_keyword" };
  }
  if (HIGH_URGENT.some((w) => textLower.includes(w.toLowerCase()))) {
    return { detected: true, severity: 4, reason: "high_keyword" };
  }
  return { detected: true, severity: 3, reason: "urgent_keyword" };
}

function hasSemanticCue(textLower: string, cues: string[]): boolean {
  return cues.some((w) => textLower.includes(w.toLowerCase()));
}

function heuristicMedicalSignals(textLower: string): NonNullable<InterpretResult["medical_signals"]> {
  return {
    breathing_issue: hasSemanticCue(textLower, BREATHING_SIGNS),
    bleeding: hasSemanticCue(textLower, BLEEDING_SIGNS),
    severe_pain: hasSemanticCue(textLower, SEVERE_PAIN_SIGNS),
    loss_of_consciousness: hasSemanticCue(textLower, LOC_SIGNS),
    trauma: hasSemanticCue(textLower, TRAUMA_SIGNS),
    infection_signs: hasSemanticCue(textLower, INFECTION_SIGNS),
    mobility_issue: hasSemanticCue(textLower, MOBILITY_SIGNS),
    psychological_distress: hasSemanticCue(textLower, PSYCH_SIGNS),
  };
}

/** Same keyword/heuristic path used when Ollama is disabled or fast-path is chosen. */
export function interpretInboundHeuristic(text: string): InterpretResult {
  const t = text.toLowerCase();
  let emergency = heuristicEmergency(t);
  const medical_signals = heuristicMedicalSignals(t);
  if (!emergency.detected) {
    if (medical_signals.loss_of_consciousness) emergency = { detected: true, severity: 5, reason: "medical_signal_loc" };
    else if (medical_signals.breathing_issue) emergency = { detected: true, severity: 5, reason: "medical_signal_breathing" };
    else if (medical_signals.bleeding) emergency = { detected: true, severity: 4, reason: "medical_signal_bleeding" };
    else if (medical_signals.severe_pain) emergency = { detected: true, severity: 4, reason: "medical_signal_severe_pain" };
  }
  const hasBookingIntent = BOOKING.some((w) => t.includes(w.toLowerCase()));
  const isChildContext = t.includes("ابني") || t.includes("بنتي") || t.includes("طفل") || t.includes("أطفال");
  const isElderlyContext = t.includes("أمي") || t.includes("ابي") || t.includes("أبي") || t.includes("كبير بالسن") || t.includes("مسن");
  const chronicConditionContext = t.includes("سكري") || t.includes("ضغط") || t.includes("قلب") || t.includes("ربو") || t.includes("مزمن");
  let intent: InterpretResult["intent"] = "unknown";
  if (emergency.detected) intent = emergency.severity >= 4 ? "emergency" : "urgent";
  else if (CANCEL.some((w) => t.includes(w))) intent = "cancel";
  else if (RESCHEDULE.some((w) => t.includes(w))) intent = "reschedule";
  else if (hasBookingIntent) intent = "booking";
  else if (t.includes("?") || t.includes("؟") || t.includes("كم") || t.includes("سعر")) intent = "question";

  const specialty =
    extractSpecialty(t) ||
    (t.includes("جلد") ? "dermatology" : null) ||
    (t.includes("عيون") ? "ophthalmology" : null) ||
    (t.includes("أسنان") || t.includes("اسنان") ? "dental" : null) ||
    (t.includes("نسائية") || t.includes("نساء") ? "gynecology" : null) ||
    (t.includes("اطفال") || t.includes("أطفال") || t.includes("بنتي") || t.includes("ولدي") || t.includes("طفل")
      ? "pediatrics"
      : null);

  const doctor_hint = (() => {
    const m = text.match(/(?:د\.|دكتور|doctor|dr\.?)\s*([^\n\r،,.]{2,40})/i);
    return m ? m[1].trim() : null;
  })();

  const needs_human = intent === "unknown" && text.trim().length > 48;
  const summary = text.trim() ? clipSummary(text, 200) : null;
  const urgency_level: InterpretResult["urgency_level"] =
    emergency.detected ? "emergency" : intent === "booking" ? "priority" : "normal";

  return {
    intent,
    specialty,
    doctor_hint,
    clinic_hint: null,
    patient_name: null,
    urgency: emergency.detected ? urgencyFromSeverity(emergency.severity) : intent === "booking" ? "medium" : "normal",
    emergency,
    medical_signals,
    patient_context: {
      known_patient: false,
      is_child: isChildContext || undefined,
      is_elderly: isElderlyContext || undefined,
      chronic_condition: chronicConditionContext || undefined,
    },
    booking_intent:
      hasBookingIntent
        ? {
            flexible: true,
          }
        : undefined,
    reply_hint: null,
    confidence: intent === "unknown" ? 0.35 : 0.72,
    source: "heuristic",
    needs_human,
    summary,
    urgency_level,
    action: emergency.detected ? "emergency_override" : intent === "booking" ? "continue_booking" : null,
    required_slots: emergency.detected || intent === "booking" ? 1 : null,
    system_event: null,
  };
}

function extractSpecialty(t: string): string | null {
  if (t.includes("جلد")) return "dermatology";
  if (t.includes("عيون")) return "ophthalmology";
  if (t.includes("اسنان") || t.includes("أسنان")) return "dental";
  if (t.includes("نسائية") || t.includes("نساء")) return "gynecology";
  if (t.includes("اطفال") || t.includes("أطفال") || t.includes("بنتي") || t.includes("ولدي") || t.includes("طفل"))
    return "pediatrics";
  return null;
}

function mergeOllamaWithHeuristic(text: string, parsed: NormalizedBrainFields): InterpretResult {
  const fallback = interpretInboundHeuristic(text);
  const emergency =
    parsed.emergency === undefined
      ? fallback.emergency
      : {
          detected: Boolean(parsed.emergency.detected),
          severity: parsed.emergency.severity,
          reason: parsed.emergency.reason ?? undefined,
        };
  const medical_signals = (() => {
    const fb = fallback.medical_signals ?? {};
    const p = parsed.medical_signals ?? {};
    return {
      breathing_issue: typeof p.breathing_issue === "boolean" ? p.breathing_issue : fb.breathing_issue,
      bleeding: typeof p.bleeding === "boolean" ? p.bleeding : fb.bleeding,
      severe_pain: typeof p.severe_pain === "boolean" ? p.severe_pain : fb.severe_pain,
      loss_of_consciousness:
        typeof p.loss_of_consciousness === "boolean" ? p.loss_of_consciousness : fb.loss_of_consciousness,
      trauma: typeof p.trauma === "boolean" ? p.trauma : fb.trauma,
      infection_signs: typeof p.infection_signs === "boolean" ? p.infection_signs : fb.infection_signs,
      mobility_issue: typeof p.mobility_issue === "boolean" ? p.mobility_issue : fb.mobility_issue,
      psychological_distress:
        typeof p.psychological_distress === "boolean" ? p.psychological_distress : fb.psychological_distress,
    };
  })();
  const urgency =
    parsed.urgency !== undefined && parsed.urgency !== null
      ? parsed.urgency
      : emergency.detected
        ? urgencyFromSeverity(emergency.severity)
        : fallback.urgency;
  let specialty: string | null;
  if (parsed.specialty === undefined) specialty = fallback.specialty;
  else if (parsed.specialty === null) specialty = null;
  else {
    const s = String(parsed.specialty).trim();
    specialty = s.length ? s : null;
  }
  let doctor_hint: string | null;
  if (parsed.doctor_hint === undefined) doctor_hint = fallback.doctor_hint;
  else if (parsed.doctor_hint === null) doctor_hint = null;
  else {
    const d = String(parsed.doctor_hint).trim();
    doctor_hint = d.length ? d : null;
  }
  let clinic_hint: string | null;
  if (parsed.clinic_hint === undefined) clinic_hint = fallback.clinic_hint;
  else if (parsed.clinic_hint === null) clinic_hint = null;
  else {
    const c = String(parsed.clinic_hint).trim();
    clinic_hint = c.length ? c : null;
  }
  let patient_name: string | null;
  if (parsed.patient_name === undefined) patient_name = fallback.patient_name;
  else if (parsed.patient_name === null) patient_name = null;
  else {
    const p = String(parsed.patient_name).trim();
    patient_name = p.length ? p.slice(0, 200) : null;
  }
  let confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.55;
  if (patient_name && (clinic_hint || specialty)) {
    confidence = Math.min(1, confidence + 0.08);
  }
  let needs_human =
    typeof parsed.needs_human === "boolean" ? parsed.needs_human : fallback.needs_human;
  let summary: string | null;
  if (parsed.summary === undefined) summary = fallback.summary;
  else if (parsed.summary === null) summary = null;
  else summary = clipSummary(String(parsed.summary), 220);
  const action =
    parsed.action === undefined ? fallback.action : parsed.action === null ? null : clipSummary(parsed.action, 64);
  const required_slots =
    typeof parsed.required_slots === "number"
      ? parsed.required_slots
      : typeof fallback.required_slots === "number"
        ? fallback.required_slots
        : null;
  const system_event = parsed.system_event === undefined ? fallback.system_event ?? null : parsed.system_event;
  const booking_intent = (() => {
    if (parsed.booking_intent === undefined) return fallback.booking_intent;
    const requested_time =
      parsed.booking_intent.requested_time == null ? undefined : clipSummary(String(parsed.booking_intent.requested_time), 120);
    const flexible = typeof parsed.booking_intent.flexible === "boolean" ? parsed.booking_intent.flexible : !requested_time;
    return { requested_time, flexible };
  })();
  const patient_context = (() => {
    if (parsed.patient_context === undefined) {
      return {
        known_patient: fallback.patient_context.known_patient || Boolean(patient_name),
        name: patient_name ?? undefined,
        is_child: fallback.patient_context.is_child,
        is_elderly: fallback.patient_context.is_elderly,
        chronic_condition: fallback.patient_context.chronic_condition,
      };
    }
    return {
      known_patient: typeof parsed.patient_context.known_patient === "boolean" ? parsed.patient_context.known_patient : Boolean(patient_name),
      name:
        parsed.patient_context.name == null
          ? patient_name ?? undefined
          : clipSummary(String(parsed.patient_context.name), 100),
      is_child:
        typeof parsed.patient_context.is_child === "boolean"
          ? parsed.patient_context.is_child
          : fallback.patient_context.is_child,
      is_elderly:
        typeof parsed.patient_context.is_elderly === "boolean"
          ? parsed.patient_context.is_elderly
          : fallback.patient_context.is_elderly,
      chronic_condition:
        typeof parsed.patient_context.chronic_condition === "boolean"
          ? parsed.patient_context.chronic_condition
          : fallback.patient_context.chronic_condition,
    };
  })();
  const reply_hint =
    parsed.reply_hint === undefined
      ? fallback.reply_hint ?? null
      : parsed.reply_hint === null
        ? null
        : clipSummary(parsed.reply_hint, 220);
  const finalIntent: InterpretResult["intent"] =
    parsed.intent === "unknown" && emergency.detected ? (emergency.severity >= 4 ? "emergency" : "urgent") : parsed.intent;
  const finalUrgencyLevel: InterpretResult["urgency_level"] =
    emergency.detected && emergency.severity >= 4
      ? "emergency"
      : parsed.urgency_level === undefined || parsed.urgency_level === null
        ? fallback.urgency_level
        : parsed.urgency_level;

  return {
    intent: finalIntent,
    specialty,
    doctor_hint,
    clinic_hint,
    patient_name,
    urgency,
    emergency,
    medical_signals,
    patient_context,
    booking_intent,
    reply_hint,
    confidence,
    source: "ollama",
    needs_human,
    summary,
    urgency_level: finalUrgencyLevel,
    action,
    required_slots,
    system_event,
  };
}

function mergeBrainParsed(text: string, raw: z.infer<typeof ollamaBrainRawSchema>): InterpretResult {
  const intent = normalizeRawIntent(raw.intent);
  const complaint = isComplaintIntent(raw.intent);
  let needs_human = raw.needs_human;
  if (complaint) needs_human = true;

  const normalized: NormalizedBrainFields = {
    intent,
    specialty: raw.specialty === null ? null : raw.specialty === undefined ? undefined : String(raw.specialty),
    doctor_hint: raw.doctor_hint === null ? null : raw.doctor_hint === undefined ? undefined : String(raw.doctor_hint),
    clinic_hint: raw.clinic_hint === null ? null : raw.clinic_hint === undefined ? undefined : String(raw.clinic_hint),
    patient_name: raw.patient_name === null ? null : raw.patient_name === undefined ? undefined : String(raw.patient_name),
    urgency: raw.urgency === null ? undefined : raw.urgency,
    confidence: raw.confidence,
    needs_human,
    summary: raw.summary === null ? null : raw.summary === undefined ? undefined : String(raw.summary),
    urgency_level: raw.urgency_level === null ? undefined : raw.urgency_level,
    action: raw.action === null ? null : raw.action === undefined ? undefined : String(raw.action),
    required_slots: raw.required_slots === null ? null : raw.required_slots === undefined ? undefined : Number(raw.required_slots),
    emergency:
      raw.emergency === undefined
        ? undefined
        : {
            detected: raw.emergency.detected,
            severity: raw.emergency.severity,
            reason:
              raw.emergency.reason === undefined || raw.emergency.reason === null
                ? undefined
                : String(raw.emergency.reason),
          },
    medical_signals:
      raw.medical_signals === undefined
        ? undefined
        : {
            breathing_issue: raw.medical_signals.breathing_issue,
            bleeding: raw.medical_signals.bleeding,
            severe_pain: raw.medical_signals.severe_pain,
            loss_of_consciousness: raw.medical_signals.loss_of_consciousness,
            trauma: raw.medical_signals.trauma,
            infection_signs: raw.medical_signals.infection_signs,
            mobility_issue: raw.medical_signals.mobility_issue,
            psychological_distress: raw.medical_signals.psychological_distress,
          },
    booking_intent:
      raw.booking_intent === undefined
        ? undefined
        : {
            requested_time:
              raw.booking_intent.requested_time === undefined || raw.booking_intent.requested_time === null
                ? undefined
                : String(raw.booking_intent.requested_time),
            flexible: raw.booking_intent.flexible,
          },
    patient_context:
      raw.patient_context === undefined
        ? undefined
        : {
            known_patient: raw.patient_context.known_patient,
            name:
              raw.patient_context.name === undefined || raw.patient_context.name === null
                ? undefined
                : String(raw.patient_context.name),
            is_child: raw.patient_context.is_child,
            is_elderly: raw.patient_context.is_elderly,
            chronic_condition: raw.patient_context.chronic_condition,
          },
    reply_hint: raw.reply_hint === null ? null : raw.reply_hint === undefined ? undefined : String(raw.reply_hint),
    system_event: raw.system_event === undefined ? undefined : raw.system_event,
  };

  const merged = mergeOllamaWithHeuristic(text, normalized);

  // Append optional Arabic assistant line / next_state into summary for ops visibility (short).
  const rt = raw.response_text != null ? String(raw.response_text).trim() : "";
  const ns = raw.next_state != null ? String(raw.next_state).trim() : "";
  if (rt || ns) {
    const tail = [rt ? `reply:${clipSummary(rt, 120)}` : null, ns ? `next:${ns}` : null].filter(Boolean).join(" | ");
    merged.summary = merged.summary ? `${merged.summary} | ${tail}` : tail;
  }

  return merged;
}

/** Exposed for unit tests (Zod + merge path). */
export function parseOllamaContent(raw: string, userText: string): InterpretResult | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = ollamaBrainRawSchema.safeParse(obj);
  if (!r.success) return null;
  return mergeBrainParsed(userText, r.data);
}

function brainPromptFromContext(text: string, ctx?: InterpretBrainContext): string {
  const input: BrainPromptInput = {
    message: text,
    conversationState: ctx?.dialogueState,
    routing: ctx?.routing,
    knownEntities: ctx?.knownEntities ?? undefined,
    clinics: ctx?.clinics?.map((c) => ({ id: c.id, name: c.name })),
    doctors: ctx?.doctors?.map((d) => ({
      id: d.id,
      name: d.name,
      specialty: d.specialty ?? null,
    })),
    workingHoursLines: ctx?.workingHoursLines,
  };
  return buildBrainUserPrompt(input);
}

export async function interpretInboundText(
  text: string,
  ctx?: InterpretBrainContext,
): Promise<InterpretResult> {
  const url = (process.env.OLLAMA_URL || "").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
  if (!url) return interpretInboundHeuristic(text);

  const userContent = brainPromptFromContext(text, ctx);

  try {
    const raw = await ollamaJsonChat(
      [
        { role: "system", content: BRAIN_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      { model, temperature: 0.2 },
    );
    if (!raw) {
      incProductMetric("ollama_interpret_fallback_total");
      return interpretInboundHeuristic(text);
    }
    const parsed = parseOllamaContent(raw, text);
    if (parsed) {
      incProductMetric("ollama_interpret_ok_total");
      return parsed;
    }
    incProductMetric("ollama_interpret_fallback_total");
  } catch {
    incProductMetric("ollama_interpret_fallback_total");
  }
  return interpretInboundHeuristic(text);
}
