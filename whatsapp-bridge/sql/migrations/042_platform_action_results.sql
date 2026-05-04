BEGIN;

CREATE TABLE IF NOT EXISTS platform_action_results (
  id BIGSERIAL PRIMARY KEY,
  action_id BIGINT NOT NULL REFERENCES platform_actions(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  metrics_after JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_action_results_action
  ON platform_action_results(action_id);

ALTER TABLE platform_actions
  ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS auto_executable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rollback_action_id BIGINT NULL REFERENCES platform_actions(id) ON DELETE SET NULL;

ALTER TABLE platform_action_logs
  ADD COLUMN IF NOT EXISTS duration_ms INT NULL,
  ADD COLUMN IF NOT EXISTS error_code TEXT NULL;

CREATE TABLE IF NOT EXISTS platform_action_rate_limits (
  action_type TEXT PRIMARY KEY,
  max_per_hour INT NOT NULL
);

COMMIT;

