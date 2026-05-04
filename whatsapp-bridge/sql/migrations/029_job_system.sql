CREATE TABLE IF NOT EXISTS system_jobs (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'retrying', 'failed_dead', 'completed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 50,
  queue_key TEXT NOT NULL DEFAULT 'default',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_system_jobs_idempotency ON system_jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_jobs_status_queue ON system_jobs(status, queue_key, run_after, priority);
CREATE INDEX IF NOT EXISTS idx_system_jobs_created ON system_jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS system_job_attempts (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES system_jobs(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ NULL,
  ok BOOLEAN NULL,
  error_text TEXT NULL,
  output JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_system_job_attempts_job ON system_job_attempts(job_id, attempt_no DESC);
