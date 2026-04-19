-- Core Backend V2: explicit dialogue state on conversations + generic transactional outbox for workers.
BEGIN;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS dialogue_state JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS dialogue_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS core_outbox (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  conversation_id BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_outbox_drain
  ON core_outbox (status, available_at)
  WHERE status IN ('pending', 'failed') AND attempts < 25;

COMMIT;
