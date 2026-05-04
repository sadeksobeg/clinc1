BEGIN;

CREATE TABLE IF NOT EXISTS trial_funnel_events (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  trial_session_id TEXT NOT NULL,
  step INTEGER,
  fields JSONB,
  count INTEGER,
  step_duration_ms INTEGER,
  reason TEXT,
  ts TIMESTAMPTZ NOT NULL,
  ts_ms BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trial_funnel_events_ts_ms
  ON trial_funnel_events (ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_trial_funnel_events_session
  ON trial_funnel_events (trial_session_id, ts_ms DESC);

COMMIT;
