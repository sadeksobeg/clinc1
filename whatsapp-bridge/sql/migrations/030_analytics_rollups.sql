CREATE TABLE IF NOT EXISTS analytics_trial_rollups (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  granularity TEXT NOT NULL CHECK (granularity IN ('hour', 'day')),
  bucket_start TIMESTAMPTZ NOT NULL,
  event_name TEXT NOT NULL,
  total_count BIGINT NOT NULL DEFAULT 0,
  unique_sessions BIGINT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_trial_rollups_bucket
  ON analytics_trial_rollups(clinic_id, granularity, bucket_start, event_name);
CREATE INDEX IF NOT EXISTS idx_trial_rollups_bucket ON analytics_trial_rollups(bucket_start DESC, granularity);
