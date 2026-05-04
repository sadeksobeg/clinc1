CREATE TABLE IF NOT EXISTS emergency_incident_snapshots (
  id BIGSERIAL PRIMARY KEY,
  activated_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  emergency_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  health JSONB NOT NULL DEFAULT '{}'::jsonb,
  queues JSONB NOT NULL DEFAULT '{}'::jsonb,
  failures JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_incident_snapshots_created_at
  ON emergency_incident_snapshots(created_at DESC);
