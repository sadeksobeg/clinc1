-- Optional audit trail for AI calls from ops-dashboard (Ollama extract / classify).

BEGIN;

CREATE TABLE IF NOT EXISTS ai_interaction_logs (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT REFERENCES clinics(id) ON DELETE SET NULL,
  conversation_id BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
  patient_id BIGINT REFERENCES patients(id) ON DELETE SET NULL,
  model TEXT,
  kind TEXT NOT NULL DEFAULT 'booking_extract',
  input_excerpt TEXT,
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_logs_clinic_created ON ai_interaction_logs(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_conversation ON ai_interaction_logs(conversation_id, created_at DESC);

COMMIT;
