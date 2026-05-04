BEGIN;

CREATE TABLE IF NOT EXISTS platform_incident_playbooks (
  id BIGSERIAL PRIMARY KEY,
  incident_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  auto_suggest BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_incident_playbooks_type
  ON platform_incident_playbooks(incident_type, auto_suggest);

COMMIT;

