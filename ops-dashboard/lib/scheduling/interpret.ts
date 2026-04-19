import type { InterpretResult } from "./types";

const BOOKING = ["حجز", "موعد", "appointment", "book", "reserve", "بدي موعد", "كشفية", "موعد"];
const CANCEL = ["إلغاء", "الغاء", "cancel"];
const RESCHEDULE = ["تأجيل", "تاجيل", "reschedule", "غير الموعد"];
const URGENT = ["طوارئ", "نزيف", "ألم شديد", "الم شديد", "urgent", "emergency", "اسعاف"];

function heuristicInterpret(text: string): InterpretResult {
  const t = text.toLowerCase();
  let intent: InterpretResult["intent"] = "unknown";
  if (URGENT.some((w) => t.includes(w))) intent = "urgent";
  else if (CANCEL.some((w) => t.includes(w))) intent = "cancel";
  else if (RESCHEDULE.some((w) => t.includes(w))) intent = "reschedule";
  else if (BOOKING.some((w) => t.includes(w))) intent = "booking";
  else if (t.includes("?") || t.includes("؟") || t.includes("كم") || t.includes("سعر")) intent = "question";

  const specialty =
    extractSpecialty(t) ||
    (t.includes("جلد") ? "dermatology" : null) ||
    (t.includes("عيون") ? "ophthalmology" : null) ||
    (t.includes("أسنان") || t.includes("اسنان") ? "dental" : null) ||
    (t.includes("نسائية") || t.includes("نساء") ? "gynecology" : null);

  const doctor_hint = (() => {
    const m = text.match(/(?:د\.|دكتور|doctor|dr\.?)\s*([^\n\r،,.]{2,40})/i);
    return m ? m[1].trim() : null;
  })();

  return {
    intent,
    specialty,
    doctor_hint,
    urgency: intent === "urgent" ? "high" : "normal",
    confidence: intent === "unknown" ? 0.35 : 0.72,
    source: "heuristic",
  };
}

function extractSpecialty(t: string): string | null {
  if (t.includes("جلد")) return "dermatology";
  if (t.includes("عيون")) return "ophthalmology";
  if (t.includes("اسنان") || t.includes("أسنان")) return "dental";
  if (t.includes("نسائية") || t.includes("نساء")) return "gynecology";
  return null;
}

type OllamaChatResponse = { message?: { content?: string } };

export async function interpretInboundText(text: string): Promise<InterpretResult> {
  const url = (process.env.OLLAMA_URL || "").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.2";
  if (!url) return heuristicInterpret(text);

  const system = `You are a classifier for Arabic clinic WhatsApp. Reply ONLY with compact JSON:
{"intent":"booking|cancel|reschedule|urgent|question|unknown","specialty":string|null,"doctor_hint":string|null,"urgency":"low|normal|high","confidence":number}
specialty use English slug: general, dermatology, ophthalmology, dental, gynecology or null.`;

  try {
    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: system },
          { role: "user", content: text.slice(0, 2000) },
        ],
      }),
    });
    if (!res.ok) return heuristicInterpret(text);
    const data = (await res.json()) as OllamaChatResponse;
    const raw = data.message?.content || "{}";
    const j = JSON.parse(raw) as Partial<InterpretResult>;
    const intent = j.intent;
    if (
      intent === "booking" ||
      intent === "cancel" ||
      intent === "reschedule" ||
      intent === "urgent" ||
      intent === "question" ||
      intent === "unknown"
    ) {
      return {
        intent,
        specialty: j.specialty ?? null,
        doctor_hint: j.doctor_hint ?? null,
        urgency: j.urgency === "high" || j.urgency === "low" ? j.urgency : "normal",
        confidence: typeof j.confidence === "number" ? j.confidence : 0.5,
        source: "ollama",
      };
    }
  } catch {
    /* fall through */
  }
  return heuristicInterpret(text);
}
