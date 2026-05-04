BEGIN;

CREATE TABLE IF NOT EXISTS billing_reminder_runs (
  id BIGSERIAL PRIMARY KEY,
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_text TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_reminder_runs_started
  ON billing_reminder_runs(started_at DESC);

COMMIT;
