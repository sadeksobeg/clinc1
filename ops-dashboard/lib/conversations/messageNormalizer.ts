import {
  DATE_PATTERNS,
  DOCTOR_KEYWORDS,
  GREETING_SYNONYMS,
  INTENT_PRIORITY,
  INTENT_SYNONYM_MAP,
  OUT_OF_CONTEXT_SYNONYMS,
  SPECIALTY_PATTERNS,
  TIME_PATTERNS,
  type MessageIntent,
} from "./messageNormalizerConstants";

export type { MessageIntent } from "./messageNormalizerConstants";

export type MessageEntities = {
  doctorName?: string;
  specialty?: string;
  dateHint?: string;
  timeHint?: string;
  price?: boolean;
};

export type NormalizedMessage = {
  original: string;
  cleaned: string;
  intent: MessageIntent;
  confidence: number;
  entities: MessageEntities;
};

function stripDiacritics(text: string): string {
  return text.replace(/[\u064B-\u065F]/g, "");
}

function normalizeAleph(text: string): string {
  return text.replace(/[أإآا]/g, "ا");
}

function normalizeTaMarbuta(text: string): string {
  return text.replace(/ة/g, "ه");
}

function collapseRepeatedChars(text: string): string {
  return text.replace(/(.)\1{2,}/g, "$1");
}

/** Public for tests — full Arabic text cleanup before synonym matching. */
export function cleanArabicText(text: string): string {
  let t = stripDiacritics(String(text || ""));
  t = normalizeAleph(t);
  t = normalizeTaMarbuta(t);
  t = collapseRepeatedChars(t);
  t = t.replace(/[A-Za-z]+/g, (m) => m.toLowerCase());
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function countSynonymMatches(cleaned: string, synonyms: readonly string[]): number {
  let count = 0;
  for (const syn of synonyms) {
    const s = cleanArabicText(syn);
    if (s.length >= 2 && cleaned.includes(s)) count += 1;
  }
  return count;
}

function extractDoctorName(cleaned: string, original: string): string | undefined {
  const m1 = original.match(/(?:^|[\s،.])(?:د\.)\s*([\u0600-\u06FFa-zA-Z]{2,})/i);
  if (m1?.[1]) return m1[1].trim();
  const m1b = original.match(/(?:^|[\s،.])د\s+([\u0600-\u06FFa-zA-Z]{2,})/i);
  if (m1b?.[1]) return m1b[1].trim();
  const m2 = cleaned.match(/(?:^|\s)(?:دكتور|طبيب|doctor|dr)\s+([\u0600-\u06FFa-z]{2,})/i);
  if (m2?.[1]) return m2[1].trim();
  return undefined;
}

function extractSpecialty(cleaned: string): string | undefined {
  for (const { pattern, slug } of SPECIALTY_PATTERNS) {
    if (pattern.test(cleaned)) return slug;
  }
  return undefined;
}

function extractDateHint(cleaned: string): string | undefined {
  for (const { pattern, hint } of DATE_PATTERNS) {
    if (pattern.test(cleaned)) return hint;
  }
  return undefined;
}

function extractTimeHint(cleaned: string): string | undefined {
  for (const { pattern, hint } of TIME_PATTERNS) {
    if (pattern.test(cleaned)) return hint;
  }
  const clock = cleaned.match(/(?:الساعه|الساعة|ساعه|ساعة)\s*(\d{1,2})/);
  if (clock?.[1]) return clock[1];
  return undefined;
}

function hasDoctorKeyword(cleaned: string): boolean {
  return DOCTOR_KEYWORDS.some((k) => cleaned.includes(cleanArabicText(k)));
}

function isPureGreeting(cleaned: string, scores: Map<MessageIntent, number>): boolean {
  const greetingScore = scores.get("GREETING") ?? 0;
  const bookingScore = scores.get("BOOKING_REQUEST") ?? 0;
  if (greetingScore === 0) return false;
  if (bookingScore > 0 || hasDoctorKeyword(cleaned)) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length <= 4;
}

function isOutOfContext(cleaned: string, scores: Map<MessageIntent, number>): boolean {
  const clinicScore =
    (scores.get("BOOKING_REQUEST") ?? 0) +
    (scores.get("PRICE_INQUIRY") ?? 0) +
    (scores.get("EMERGENCY") ?? 0) +
    (scores.get("CANCEL_APPOINTMENT") ?? 0);
  if (clinicScore > 0) return false;
  return OUT_OF_CONTEXT_SYNONYMS.some((w) => cleaned.includes(cleanArabicText(w)));
}

function pickIntent(scores: Map<MessageIntent, number>): MessageIntent {
  let best: MessageIntent = "UNKNOWN";
  let bestPriority = INTENT_PRIORITY.length;
  for (const [intent, count] of scores.entries()) {
    if (count <= 0) continue;
    const pri = INTENT_PRIORITY.indexOf(intent);
    if (pri >= 0 && pri < bestPriority) {
      bestPriority = pri;
      best = intent;
    }
  }
  return best;
}

function confidenceFromMatches(matchCount: number, bonus = 0): number {
  if (matchCount <= 0) return 0.1;
  return Math.min(1, 0.2 + matchCount * 0.25 + bonus);
}

export function normalizeArabicMessage(text: string): NormalizedMessage {
  const original = String(text || "").trim();
  const cleaned = cleanArabicText(original);

  const scores = new Map<MessageIntent, number>();
  for (const [intent, synonyms] of Object.entries(INTENT_SYNONYM_MAP) as Array<
    [keyof typeof INTENT_SYNONYM_MAP, readonly string[]]
  >) {
    scores.set(intent, countSynonymMatches(cleaned, synonyms));
  }

  const doctorName = extractDoctorName(cleaned, original);
  const specialty = extractSpecialty(cleaned);
  const dateHint = extractDateHint(cleaned);
  const timeHint = extractTimeHint(cleaned);
  const priceFlag = (scores.get("PRICE_INQUIRY") ?? 0) > 0;

  if (doctorName) {
    scores.set("DOCTOR_REQUEST", Math.max(scores.get("DOCTOR_REQUEST") ?? 0, 2));
  } else if (specialty && hasDoctorKeyword(cleaned)) {
    scores.set("DOCTOR_REQUEST", Math.max(scores.get("DOCTOR_REQUEST") ?? 0, 1));
  }

  for (const g of GREETING_SYNONYMS) {
    const gs = cleanArabicText(g);
    if (cleaned === gs || cleaned.startsWith(`${gs} `)) {
      scores.set("GREETING", Math.max(scores.get("GREETING") ?? 0, 3));
      scores.set("AFFIRMATION", 0);
      break;
    }
  }

  if (isOutOfContext(cleaned, scores)) {
    scores.set("OUT_OF_CONTEXT", 1);
  }

  if (isPureGreeting(cleaned, scores)) {
    scores.set("GREETING", Math.max(scores.get("GREETING") ?? 0, 1));
  }

  let intent = pickIntent(scores);
  const matchCount = scores.get(intent) ?? 0;

  if (intent === "UNKNOWN" && doctorName) {
    intent = "DOCTOR_REQUEST";
  }

  if (intent === "UNKNOWN" && cleaned.length < 2) {
    intent = "GREETING";
  }

  let confidence = confidenceFromMatches(
    intent === "DOCTOR_REQUEST" ? Math.max(matchCount, doctorName ? 2 : 1) : matchCount,
    specialty ? 0.1 : 0,
  );

  if (intent === "UNKNOWN") confidence = 0.1;

  const entities: MessageEntities = {};
  if (doctorName) entities.doctorName = doctorName;
  if (specialty) entities.specialty = specialty;
  if (dateHint) entities.dateHint = dateHint;
  if (timeHint) entities.timeHint = timeHint;
  if (priceFlag || intent === "PRICE_INQUIRY") entities.price = true;

  return { original, cleaned, intent, confidence, entities };
}

/** Map rules intent to legacy InterpretResult.intent for booking FSM bridge. */
export function rulesIntentToInterpretIntent(intent: MessageIntent): "booking" | "cancel" | "reschedule" | "urgent" | "question" | "unknown" | "emergency" {
  switch (intent) {
    case "BOOKING_REQUEST":
    case "DOCTOR_REQUEST":
    case "TIME_INQUIRY":
      return "booking";
    case "CANCEL_APPOINTMENT":
      return "cancel";
    case "RESCHEDULE":
      return "reschedule";
    case "EMERGENCY":
      return "emergency";
    case "PRICE_INQUIRY":
      return "question";
    case "NEGATION":
      return "unknown";
    default:
      return "unknown";
  }
}

export function normalizedToInterpretResult(msg: NormalizedMessage): import("@/lib/scheduling/types").InterpretResult {
  const emergency = msg.intent === "EMERGENCY";
  return {
    intent: rulesIntentToInterpretIntent(msg.intent),
    specialty: msg.entities.specialty ?? null,
    doctor_hint: msg.entities.doctorName ?? null,
    clinic_hint: null,
    patient_name: null,
    urgency: emergency ? "high" : "normal",
    emergency: { detected: emergency, severity: emergency ? 4 : 1 },
    patient_context: { known_patient: false },
    booking_intent: msg.entities.dateHint
      ? { requested_time: msg.entities.dateHint, flexible: !msg.entities.timeHint }
      : undefined,
    confidence: msg.confidence,
    source: "heuristic",
    needs_human: msg.intent === "UNKNOWN" && msg.confidence < 0.3,
    summary: null,
  };
}
