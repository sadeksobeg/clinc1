ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS support_breach_flag BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS support_first_response_due_at TIMESTAMPTZ NULL;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS support_priority_score INTEGER NOT NULL DEFAULT 50;

CREATE INDEX IF NOT EXISTS idx_support_tickets_breach
  ON support_tickets(support_breach_flag, status, priority, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_agent_capacity (
  id BIGSERIAL PRIMARY KEY,
  agent_user_id BIGINT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  clinic_id BIGINT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  max_open_tickets INTEGER NOT NULL DEFAULT 20,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_user_id, clinic_id)
);
