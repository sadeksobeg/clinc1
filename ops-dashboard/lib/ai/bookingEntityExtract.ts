import { z } from "zod";
import type { Pool } from "pg";
import { ollamaJsonChat } from "./ollamaClient";

const extractSchema = z.object({
  clinic_name_hint: z.string().max(120).nullable().optional(),
  doctor_name_hint: z.string().max(120).nullable().optional(),
  patient_name_hint: z.string().max(200).nullable().optional(),
  child: z.boolean().optional(),
  symptom_short: z.string().max(200).nullable().optional(),
  wants_booking: z.boolean().optional(),
});

export type BookingEntityExtract = {
  clinic_name_hint: string | null;
  doctor_name_hint: string | null;
  patient_name_hint: string | null;
  child: boolean | null;
  symptom_short: string | null;
  wants_booking: boolean | null;
  source: "ollama" | "none";
};

function parseExtractJson(raw: string | null): BookingEntityExtract | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = extractSchema.safeParse(obj);
  if (!r.success) return null;
  const d = r.data;
  return {
    clinic_name_hint: d.clinic_name_hint ?? null,
    doctor_name_hint: d.doctor_name_hint ?? null,
    patient_name_hint: d.patient_name_hint ?? null,
    child: typeof d.child === "boolean" ? d.child : null,
    symptom_short: d.symptom_short ?? null,
    wants_booking: typeof d.wants_booking === "boolean" ? d.wants_booking : null,
    source: "ollama",
  };
}

const systemPrompt = `You extract structured facts from Arabic (and mixed English) clinic WhatsApp messages.
Reply with ONE JSON object only:
{"clinic_name_hint":string|null,"doctor_name_hint":string|null,"patient_name_hint":string|null,"child":boolean,"symptom_short":string|null,"wants_booking":boolean}
Use null when unknown. doctor_name_hint: substring as patient said (e.g. دكتور أحمد). clinic_name_hint if they name a clinic branch. patient_name_hint if they give a person's full name for the visit.`;

export async function extractBookingEntities(patientText: string): Promise<BookingEntityExtract> {
  const raw = await ollamaJsonChat([
    { role: "system", content: systemPrompt },
    { role: "user", content: patientText.slice(0, 2000) },
  ]);
  const parsed = parseExtractJson(raw);
  if (parsed) return parsed;
  return {
    clinic_name_hint: null,
    doctor_name_hint: null,
    patient_name_hint: null,
    child: null,
    symptom_short: null,
    wants_booking: null,
    source: "none",
  };
}

/** Match doctor list by display_name contains hint (case-insensitive Arabic fold minimal). */
export function pickDoctorIndexByHint(
  doctors: { ix: number; doctor_id: number; display_name: string }[],
  hint: string | null | undefined,
): number | null {
  if (!hint || !doctors.length) return null;
  const h = hint.trim().toLowerCase().replace(/^د\.?\s*|دكتور\s*|dr\.?\s*/i, "");
  if (h.length < 2) return null;
  const idx = doctors.findIndex((d) => d.display_name.toLowerCase().includes(h) || h.includes(d.display_name.toLowerCase().slice(0, 8)));
  if (idx < 0) return null;
  return doctors[idx]!.ix;
}

/** Match clinic pick list by name contains hint. */
export function pickClinicIndexByHint(
  clinics: { ix: number; clinic_id: number; name: string }[],
  hint: string | null | undefined,
): number | null {
  if (!hint || !clinics.length) return null;
  const h = hint.trim().toLowerCase();
  if (h.length < 2) return null;
  const idx = clinics.findIndex((c) => c.name.toLowerCase().includes(h));
  if (idx < 0) return null;
  return clinics[idx]!.ix;
}

export async function logAiExtract(
  pool: Pool,
  row: {
    clinic_id: number;
    conversation_id: number;
    patient_id: number;
    kind: string;
    input_excerpt: string;
    output: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
    await pool.query(
      `INSERT INTO ai_interaction_logs (clinic_id, conversation_id, patient_id, model, kind, input_excerpt, output_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        row.clinic_id,
        row.conversation_id,
        row.patient_id,
        model,
        row.kind,
        row.input_excerpt.slice(0, 500),
        JSON.stringify(row.output),
      ],
    );
  } catch {
    /* optional table */
  }
}
