-- Idempotency ledger for event consumers (stream replay / duplicate delivery).
BEGIN;

CREATE TABLE IF NOT EXISTS processed_events (
  event_id TEXT PRIMARY KEY,
  stream_id TEXT,
  event_type TEXT NOT NULL,
  clinic_id BIGINT REFERENCES clinics(id) ON DELETE SET NULL,
  conversation_id BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_processed_events_conversation
  ON processed_events (conversation_id, processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_processed_events_type_time
  ON processed_events (event_type, processed_at DESC);

COMMIT;
