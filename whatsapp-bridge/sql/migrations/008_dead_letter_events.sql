-- Failed event deliveries for inspection / manual replay (not automatic re-drive in v1).
BEGIN;

CREATE TABLE IF NOT EXISTS dead_letter_events (
  id BIGSERIAL PRIMARY KEY,
  stream_id TEXT,
  event_id TEXT,
  event_type TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_events_created
  ON dead_letter_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dead_letter_events_event_id
  ON dead_letter_events (event_id);

COMMIT;
