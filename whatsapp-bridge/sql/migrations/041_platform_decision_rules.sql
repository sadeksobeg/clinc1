BEGIN;

CREATE TABLE IF NOT EXISTS platform_decision_rules (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  rule_expression JSONB NOT NULL,
  suggested_action_type TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_decision_rules_enabled
  ON platform_decision_rules(enabled, created_at DESC);

ALTER TABLE platform_decisions
  ADD COLUMN IF NOT EXISTS suggested_action_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;

