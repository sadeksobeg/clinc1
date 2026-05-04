CREATE TABLE IF NOT EXISTS platform_incidents (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NULL REFERENCES clinics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'assigned', 'resolved')),
  source TEXT NOT NULL DEFAULT 'platform',
  dedupe_key TEXT NULL,
  created_by BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  acknowledged_by BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  assigned_to BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  resolved_by BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  assigned_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_incidents_dedupe_key
  ON platform_incidents(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_incidents_clinic_status
  ON platform_incidents(clinic_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_incidents_status_severity
  ON platform_incidents(status, severity, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_incident_events (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL REFERENCES platform_incidents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'acknowledged', 'assigned', 'resolved', 'comment', 'severity_changed', 'status_changed')),
  actor_user_id BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_incident_events_incident_created
  ON platform_incident_events(incident_id, created_at DESC);

