import { z } from "zod";
import type { Pool } from "pg";
import { interpretInboundHeuristic } from "@/lib/scheduling/interpret";
import type { InterpretResult } from "@/lib/scheduling/types";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";

export type AIAnalysisInput = {
  text: string;
  conversationHistory: Array<{ role: "patient" | "system"; text: string; at: Date }>;
  patient: { name?: string; visitCount: number; tags: string[] };
  availableServices: Array<{ name: string; doctors: string[] }>;
  clinicId: number;
  language: "ar" | "en";
};

export type AIAnalysisResult = {
  intent: "booking" | "inquiry" | "complaint" | "emergency" | "other";
  entities: {
    doctor_name?: string;
    specialty?: string;
    date?: string;
    time?: string;
    patient_name?: string;
  };
  suggested_reply: string;
  confidence: number;
  needs_human: boolean;
  needs_human_reason?: string;
};

export interface AIModelAdapter {
  analyze(input: AIAnalysisInput): Promise<AIAnalysisResult>;
  isAvailable(): Promise<boolean>;
}

const aiResultSchema = z.object({
  intent: z.enum(["booking", "inquiry", "complaint", "emergency", "other"]),
  entities: z
    .object({
      doctor_name: z.string().optional(),
      specialty: z.string().optional(),
      date: z.string().optional(),
      time: z.string().optional(),
      patient_name: z.string().optional(),
    })
    .optional()
    .default({}),
  suggested_reply: z.string().optional().default(""),
  confidence: z.number().min(0).max(1),
  needs_human: z.boolean().optional().default(false),
  needs_human_reason: z.string().optional(),
});

export function getAIConfidenceThreshold(): number {
  const raw = Number(process.env.AI_CONFIDENCE_THRESHOLD ?? 0.72);
  if (!Number.isFinite(raw)) return 0.72;
  return Math.max(0, Math.min(1, raw));
}

function heuristicIntentToAi(intent: InterpretResult["intent"]): AIAnalysisResult["intent"] {
  if (intent === "booking" || intent === "cancel" || intent === "reschedule") return "booking";
  if (intent === "emergency" || intent === "urgent") return "emergency";
  if (intent === "complaint") return "complaint";
  if (intent === "question" || intent === "info" || intent === "followup") return "inquiry";
  return "other";
}

function interpretToAiResult(int: InterpretResult): AIAnalysisResult {
  return {
    intent: heuristicIntentToAi(int.intent),
    entities: {
      doctor_name: int.doctor_hint ?? undefined,
      specialty: int.specialty ?? undefined,
      patient_name: int.patient_name ?? undefined,
      time: int.booking_intent?.requested_time ?? undefined,
    },
    suggested_reply: int.reply_hint ?? int.summary ?? "",
    confidence: Number.isFinite(int.confidence) ? int.confidence : 0.5,
    needs_human: Boolean(int.needs_human),
    needs_human_reason: int.needs_human ? int.summary ?? "heuristic_handoff" : undefined,
  };
}

/** Map high-confidence external AI output into scheduling InterpretResult. */
export function aiAnalysisToInterpretResult(ai: AIAnalysisResult, source: "external_ai" | "heuristic_adapter"): InterpretResult {
  let intent: InterpretResult["intent"] = "unknown";
  if (ai.intent === "booking") intent = "booking";
  else if (ai.intent === "emergency") intent = "emergency";
  else if (ai.intent === "complaint") intent = "complaint";
  else if (ai.intent === "inquiry") intent = "question";
  else intent = "unknown";

  const emergency =
    ai.intent === "emergency"
      ? { detected: true, severity: 5 as const, reason: ai.needs_human_reason ?? "ai_emergency" }
      : { detected: false, severity: 1 as const };

  const requestedTime =
    ai.entities.time || ai.entities.date
      ? [ai.entities.date, ai.entities.time].filter(Boolean).join(" ")
      : undefined;

  return {
    intent,
    specialty: ai.entities.specialty ?? null,
    doctor_hint: ai.entities.doctor_name ?? null,
    clinic_hint: null,
    patient_name: ai.entities.patient_name ?? null,
    urgency: ai.intent === "emergency" ? "critical" : "normal",
    emergency,
    patient_context: { known_patient: false },
    booking_intent: requestedTime ? { requested_time: requestedTime, flexible: true } : undefined,
    reply_hint: ai.suggested_reply || null,
    confidence: ai.confidence,
    source: source === "external_ai" ? "ollama" : "heuristic",
    needs_human: ai.needs_human,
    summary: ai.needs_human_reason ?? null,
  };
}

export class HeuristicAdapter implements AIModelAdapter {
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async analyze(input: AIAnalysisInput): Promise<AIAnalysisResult> {
    const int = interpretInboundHeuristic(input.text);
    return interpretToAiResult(int);
  }
}

export class ExternalAIAdapter implements AIModelAdapter {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs = 8000;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });
      return res.ok;
    } catch {
      return true;
    }
  }

  async analyze(input: AIAnalysisInput): Promise<AIAnalysisResult> {
    const res = await fetch(`${this.baseUrl}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      throw new Error(`external_ai_http_${res.status}:${bodyText.slice(0, 400)}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(bodyText);
    } catch {
      throw new Error("external_ai_invalid_json");
    }
    const parsed = aiResultSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`external_ai_schema:${parsed.error.message.slice(0, 200)}`);
    }
    const d = parsed.data;
    return {
      intent: d.intent,
      entities: d.entities ?? {},
      suggested_reply: d.suggested_reply ?? "",
      confidence: d.confidence,
      needs_human: d.needs_human ?? false,
      needs_human_reason: d.needs_human_reason,
    };
  }
}

let cachedAdapter: AIModelAdapter | null = null;

export function getAIAdapter(): AIModelAdapter {
  if (cachedAdapter) return cachedAdapter;
  const url = (process.env.EXTERNAL_AI_URL || "").trim();
  const token = (process.env.EXTERNAL_AI_TOKEN || "").trim();
  if (url) {
    cachedAdapter = new ExternalAIAdapter(url, token);
  } else {
    cachedAdapter = new HeuristicAdapter();
  }
  return cachedAdapter;
}

/** For tests: reset factory. */
export function resetAIAdapterForTests(adapter: AIModelAdapter | null = null): void {
  cachedAdapter = adapter;
}

export async function buildAIAnalysisInput(
  pool: Pool,
  crm: InboundIngestRow,
  text: string,
): Promise<AIAnalysisInput> {
  const historyR = await pool.query(
    `SELECT m.direction, m.text, m.created_at
     FROM messages m
     WHERE m.conversation_id = $1 AND m.clinic_id = $2
     ORDER BY m.created_at DESC
     LIMIT 10`,
    [crm.conversation_id, crm.clinic_id],
  );
  const conversationHistory = historyR.rows
    .map((row) => {
      const dir = String(row.direction || "");
      const role: "patient" | "system" = dir === "inbound" || dir === "patient" ? "patient" : "system";
      return {
        role,
        text: String(row.text || ""),
        at: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
      };
    })
    .reverse();

  const visitR = await pool.query(
    `SELECT COUNT(*)::int AS c FROM appointments a
     WHERE a.patient_id = $1 AND a.clinic_id = $2 AND a.deleted_at IS NULL`,
    [crm.patient_id, crm.clinic_id],
  );
  const visitCount = Number(visitR.rows[0]?.c ?? 0);

  const doctorsR = await pool.query(
    `SELECT d.id, d.display_name, d.specialty
     FROM doctors d
     WHERE d.clinic_id = $1 AND d.deleted_at IS NULL AND d.is_active IS NOT FALSE
     ORDER BY d.display_name
     LIMIT 30`,
    [crm.clinic_id],
  );
  const bySpecialty = new Map<string, string[]>();
  for (const row of doctorsR.rows) {
    const spec = String(row.specialty || "general");
    const name = String(row.display_name || `Doctor ${row.id}`);
    const list = bySpecialty.get(spec) ?? [];
    list.push(name);
    bySpecialty.set(spec, list);
  }
  const availableServices = Array.from(bySpecialty.entries()).map(([name, doctors]) => ({
    name,
    doctors,
  }));

  const tags: string[] = [];
  if (crm.patient_status && crm.patient_status !== "new") tags.push(crm.patient_status);

  const isArabic = /[\u0600-\u06FF]/.test(text);

  return {
    text,
    conversationHistory,
    patient: {
      name: crm.patient_display_name ?? undefined,
      visitCount,
      tags,
    },
    availableServices,
    clinicId: crm.clinic_id,
    language: isArabic ? "ar" : "en",
  };
}

export async function setConversationHandoffPending(
  pool: Pool,
  conversationId: number,
  clinicId: number,
  reason: string,
): Promise<void> {
  await pool.query(
    `UPDATE conversations
     SET state = 'PENDING_HANDOFF',
         handoff_reason = $2,
         routing = COALESCE(routing, '{}'::jsonb) || $3::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND clinic_id = $4`,
    [
      conversationId,
      reason.slice(0, 500),
      JSON.stringify({ handoff_required: true, handoff_at: new Date().toISOString() }),
      clinicId,
    ],
  );
}
