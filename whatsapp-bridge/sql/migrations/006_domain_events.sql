-- Append-only domain events for audit / limited replay (Phase 6 backbone).
BEGIN;

CREATE TABLE IF NOT EXISTS domain_events (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  conversation_id BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_events_conversation
  ON domain_events (conversation_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_clinic_type
  ON domain_events (clinic_id, event_type, occurred_at DESC);

COMMIT;
