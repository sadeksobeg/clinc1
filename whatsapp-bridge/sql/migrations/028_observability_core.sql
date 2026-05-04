CREATE TABLE IF NOT EXISTS request_traces (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  clinic_id BIGINT NULL REFERENCES clinics(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  source_app TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ NULL,
  duration_ms INTEGER NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_request_traces_started ON request_traces(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_traces_clinic_started ON request_traces(clinic_id, started_at DESC);

CREATE TABLE IF NOT EXISTS structured_logs (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NULL,
  trace_id BIGINT NULL REFERENCES request_traces(id) ON DELETE SET NULL,
  clinic_id BIGINT NULL REFERENCES clinics(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  job_id BIGINT NULL,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  event_name TEXT NOT NULL,
  message TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_structured_logs_created ON structured_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_structured_logs_request ON structured_logs(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_structured_logs_event ON structured_logs(event_name, created_at DESC);

CREATE TABLE IF NOT EXISTS error_aggregations (
  id BIGSERIAL PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurrences BIGINT NOT NULL DEFAULT 1,
  sample_error TEXT NOT NULL,
  sample_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_error_aggregations_last_seen ON error_aggregations(last_seen_at DESC);
