-- Clinic CRM bootstrap v2 (multi-tenant) — PostgreSQL 13+
-- For existing v1 databases, run sql/migrations/001_multitenant.sql instead of this file.

BEGIN;

CREATE TABLE IF NOT EXISTS clinics (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Amman',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO clinics (id, slug, name)
VALUES (1, 'default', 'Default Clinic')
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('clinics', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM clinics), 1)
);

CREATE TABLE IF NOT EXISTS staff_users (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'operator',
  password_hash TEXT,
  external_auth_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, email),
  CONSTRAINT staff_users_role_check CHECK (role IN ('admin', 'operator', 'viewer', 'staff', 'secretary', 'doctor'))
);

CREATE TABLE IF NOT EXISTS patients (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL DEFAULT 1 REFERENCES clinics(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  phone_e164 TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  is_blacklisted BOOLEAN NOT NULL DEFAULT FALSE,
  is_vip BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_language TEXT NOT NULL DEFAULT 'ar',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, chat_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL DEFAULT 1 REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'open',
  state TEXT NOT NULL DEFAULT 'NEW',
  routing JSONB NOT NULL DEFAULT '{}'::jsonb,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL DEFAULT 1 REFERENCES clinics(id) ON DELETE CASCADE,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  message_id TEXT,
  dedupe_hash TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  text TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT 'general',
  priority INTEGER NOT NULL DEFAULT 4,
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  dedup_skipped BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'n8n',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL DEFAULT 1 REFERENCES clinics(id) ON DELETE CASCADE,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL DEFAULT 'urgent',
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  notes TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cases (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL DEFAULT 1 REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  conversation_id BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
  assigned_to BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
  sla_deadline TIMESTAMPTZ,
  workflow_status TEXT NOT NULL DEFAULT 'open',
  case_type TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  summary TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'n8n',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cases_workflow_status_check CHECK (workflow_status IN ('open', 'triaged', 'in_progress', 'waiting_patient', 'resolved', 'closed'))
);

CREATE TABLE IF NOT EXISTS doctors (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT 'general',
  slot_duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK (slot_duration_minutes > 0 AND slot_duration_minutes <= 240),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  staff_user_id BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctor_working_hours (
  id BIGSERIAL PRIMARY KEY,
  doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  opens_at TIME NOT NULL,
  closes_at TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (doctor_id, weekday),
  CHECK (opens_at < closes_at)
);

CREATE TABLE IF NOT EXISTS doctor_leaves (
  id BIGSERIAL PRIMARY KEY,
  doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_at < ends_at)
);

CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id BIGINT REFERENCES patients(id) ON DELETE SET NULL,
  conversation_id BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
  doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reminder_sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  no_show BOOLEAN NOT NULL DEFAULT FALSE,
  source_channel TEXT NOT NULL DEFAULT 'whatsapp',
  notes TEXT,
  specialty_requested TEXT,
  visit_kind TEXT NOT NULL DEFAULT 'consult',
  sequence_no INTEGER,
  patient_arrival_state TEXT NOT NULL DEFAULT 'expected',
  confirmed_at TIMESTAMPTZ,
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  staff_user_id BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
  google_event_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_status_check CHECK (status IN ('pending', 'confirmed', 'cancelled', 'no_show', 'completed')),
  CONSTRAINT appointments_patient_arrival_state_check CHECK (patient_arrival_state IN ('expected', 'late', 'checked_in', 'no_show'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_key
  ON appointments(idempotency_key) WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS reschedule_logs (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  appointment_id BIGINT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  old_starts_at TIMESTAMPTZ NOT NULL,
  new_starts_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL DEFAULT 'reschedule',
  actor_staff_id BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  template_kind TEXT NOT NULL CHECK (template_kind IN ('reminder', 'reschedule', 'late_check', 'doctor_delay', 'custom')),
  body_ar TEXT NOT NULL,
  scheduled_send_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'cancelled')),
  dedupe_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_outbox_dedupe
  ON notification_outbox(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_due
  ON notification_outbox(status, scheduled_send_at) WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS clinic_day_queue_state (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  queue_date DATE NOT NULL,
  doctor_available BOOLEAN NOT NULL DEFAULT TRUE,
  current_appointment_id BIGINT REFERENCES appointments(id) ON DELETE SET NULL,
  paused_until TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, doctor_id, queue_date)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT REFERENCES clinics(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_decisions (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL DEFAULT 1 REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id BIGINT REFERENCES patients(id) ON DELETE CASCADE,
  conversation_id BIGINT REFERENCES conversations(id) ON DELETE CASCADE,
  inbound_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  intent TEXT,
  priority TEXT,
  handoff_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  validated_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_health (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL DEFAULT 1 REFERENCES clinics(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL,
  provider TEXT,
  model TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_clinic_last_seen ON patients(clinic_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_status ON patients(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_blacklist ON patients(clinic_id, is_blacklisted) WHERE is_blacklisted = TRUE;
CREATE INDEX IF NOT EXISTS idx_patients_clinic_vip ON patients(clinic_id, is_vip) WHERE is_vip = TRUE;
CREATE INDEX IF NOT EXISTS idx_conversations_clinic_patient_status ON conversations(clinic_id, patient_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_clinic_state ON conversations(clinic_id, state);
CREATE INDEX IF NOT EXISTS idx_messages_clinic_conversation_created ON messages(clinic_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_intent_created_at ON messages(intent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_urgent_created_at ON messages(is_urgent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_priority_created_at ON messages(priority, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_clinic_dedupe_hash ON messages(clinic_id, dedupe_hash) WHERE dedupe_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_clinic_status_created ON alerts(clinic_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_clinic_patient_status ON cases(clinic_id, patient_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_clinic_priority_created ON cases(clinic_id, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_assigned ON cases(assigned_to, workflow_status);
CREATE INDEX IF NOT EXISTS idx_cases_sla ON cases(sla_deadline) WHERE workflow_status <> 'closed';
CREATE INDEX IF NOT EXISTS idx_ai_decisions_clinic_conversation_created ON ai_decisions(clinic_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_intent_created_at ON ai_decisions(intent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_health_clinic_created_at ON ai_health(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_starts ON appointments(clinic_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_doctors_clinic_active ON doctors(clinic_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_range ON appointments(doctor_id, starts_at, ends_at) WHERE deleted_at IS NULL AND status NOT IN ('cancelled', 'no_show');
CREATE INDEX IF NOT EXISTS idx_audit_clinic_created ON audit_logs(clinic_id, created_at DESC);

COMMIT;
