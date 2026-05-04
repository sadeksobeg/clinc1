import type { Pool } from "pg";

const SUMMARY_MAX = 900;

export type PatientConversationMemoryRow = {
  summary_ar: string | null;
  facts_jsonb: Record<string, unknown>;
  last_inbound_at: string | null;
};

export async function fetchPatientConversationMemory(
  pool: Pool,
  clinicId: number,
  patientId: number,
): Promise<PatientConversationMemoryRow | null> {
  const r = await pool.query<{
    summary_ar: string | null;
    facts_jsonb: unknown;
    last_inbound_at: Date | string | null;
  }>(
    `SELECT summary_ar, facts_jsonb, last_inbound_at
     FROM patient_conversation_memory
     WHERE clinic_id = $1 AND patient_id = $2`,
    [clinicId, patientId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const facts =
    row.facts_jsonb && typeof row.facts_jsonb === "object" && !Array.isArray(row.facts_jsonb)
      ? (row.facts_jsonb as Record<string, unknown>)
      : {};
  return {
    summary_ar: row.summary_ar,
    facts_jsonb: facts,
    last_inbound_at: row.last_inbound_at != null ? String(row.last_inbound_at) : null,
  };
}

export async function upsertPatientConversationMemory(
  pool: Pool,
  args: {
    clinic_id: number;
    patient_id: number;
    summary_ar?: string | null;
    facts_patch?: Record<string, unknown> | null;
  },
): Promise<void> {
  const summary = args.summary_ar != null ? String(args.summary_ar).trim().slice(0, SUMMARY_MAX) : null;
  const patch = args.facts_patch && typeof args.facts_patch === "object" ? args.facts_patch : {};
  await pool.query(
    `INSERT INTO patient_conversation_memory (clinic_id, patient_id, summary_ar, facts_jsonb, last_inbound_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
     ON CONFLICT (clinic_id, patient_id) DO UPDATE SET
       summary_ar = COALESCE(EXCLUDED.summary_ar, patient_conversation_memory.summary_ar),
       facts_jsonb = COALESCE(patient_conversation_memory.facts_jsonb, '{}'::jsonb) || COALESCE(EXCLUDED.facts_jsonb, '{}'::jsonb),
       last_inbound_at = NOW(),
       updated_at = NOW()`,
    [args.clinic_id, args.patient_id, summary, JSON.stringify(patch)],
  );
}
