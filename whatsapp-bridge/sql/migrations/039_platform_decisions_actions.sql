CREATE TABLE IF NOT EXISTS platform_decisions (
  id BIGSERIAL PRIMARY KEY,
  decision_type TEXT NOT NULL,
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  clinic_id BIGINT NULL REFERENCES clinics(id) ON DELETE SET NULL,
  incident_id BIGINT NULL REFERENCES platform_incidents(id) ON DELETE SET NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executed', 'cancelled')),
  requested_by BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  approved_by BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NULL,
  executed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_decisions_status_created
  ON platform_decisions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_decisions_clinic_created
  ON platform_decisions(clinic_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_actions (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('clinic', 'system', 'component', 'incident')),
  target_id BIGINT NULL,
  clinic_id BIGINT NULL REFERENCES clinics(id) ON DELETE SET NULL,
  incident_id BIGINT NULL REFERENCES platform_incidents(id) ON DELETE SET NULL,
  decision_id BIGINT NULL REFERENCES platform_decisions(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'rolled_back')),
  requested_by BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  approved_by BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_actions_idempotency
  ON platform_actions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_actions_status_created
  ON platform_actions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_actions_clinic_created
  ON platform_actions(clinic_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_action_logs (
  id BIGSERIAL PRIMARY KEY,
  action_id BIGINT NOT NULL REFERENCES platform_actions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'started', 'success', 'failed', 'rolled_back', 'note')),
  message TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_action_logs_action_created
  ON platform_action_logs(action_id, created_at DESC);

