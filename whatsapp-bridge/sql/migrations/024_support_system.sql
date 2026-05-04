CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  created_by BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'escalated', 'resolved')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  assigned_to BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  support_sla_deadline TIMESTAMPTZ NULL,
  support_first_response_at TIMESTAMPTZ NULL,
  support_resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_clinic_status ON support_tickets(clinic_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  sender_user_id BIGINT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL DEFAULT 'clinic_user',
  body TEXT NOT NULL,
  is_internal_note BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created ON support_ticket_messages(ticket_id, created_at ASC);
