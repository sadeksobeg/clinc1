-- Per-patient short memory for AI Level 2 (ops interpret context + writeback).

BEGIN;

CREATE TABLE IF NOT EXISTS patient_conversation_memory (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  summary_ar TEXT,
  facts_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_inbound_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_conversation_memory_clinic ON patient_conversation_memory(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_conversation_memory_updated ON patient_conversation_memory(updated_at DESC);

COMMENT ON TABLE patient_conversation_memory IS 'Short Arabic summary + facts for AI context across sessions; PII-minimal.';

COMMIT;
