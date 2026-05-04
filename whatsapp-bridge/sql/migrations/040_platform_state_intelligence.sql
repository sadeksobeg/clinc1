BEGIN;

ALTER TABLE platform_system_state
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS blast_radius INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_impact_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS primary_cause TEXT NULL,
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE platform_component_states
  ADD COLUMN IF NOT EXISTS signal_sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS impact_score INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS platform_component_clinic_impact (
  component TEXT NOT NULL,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  last_failure_at TIMESTAMPTZ NULL,
  PRIMARY KEY (component, clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_component_clinic_impact_component
  ON platform_component_clinic_impact(component, last_failure_at DESC);

COMMIT;

