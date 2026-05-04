BEGIN;

ALTER TABLE trial_funnel_events
  ADD COLUMN IF NOT EXISTS clinic_id BIGINT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS landing_path TEXT,
  ADD COLUMN IF NOT EXISTS experiment_id TEXT,
  ADD COLUMN IF NOT EXISTS variant_id TEXT,
  ADD COLUMN IF NOT EXISTS cohort_key TEXT;

CREATE INDEX IF NOT EXISTS idx_trial_funnel_events_cohort
  ON trial_funnel_events(cohort_key, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_trial_funnel_events_variant
  ON trial_funnel_events(experiment_id, variant_id, ts_ms DESC);

COMMIT;
