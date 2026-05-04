BEGIN;

CREATE TABLE IF NOT EXISTS platform_outcome_history (
  id BIGSERIAL PRIMARY KEY,
  incident_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  success_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  sample_size INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (incident_type, action_type)
);

COMMIT;

