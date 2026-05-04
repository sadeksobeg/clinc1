-- Clinic Scheduling Engine (run after 002_enterprise_layer.sql)
BEGIN;

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;
ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_role_check
  CHECK (role IN ('admin', 'operator', 'viewer', 'staff', 'secretary', 'doctor', 'owner', 'ops_admin', 'ops_manager', 'super_admin'));

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS routing JSONB NOT NULL DEFAULT '{}'::jsonb;

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

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS specialty_requested TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS visit_kind TEXT NOT NULL DEFAULT 'consult';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS sequence_no INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_arrival_state TEXT NOT NULL DEFAULT 'expected';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patient_arrival_state_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_patient_arrival_state_check
  CHECK (patient_arrival_state IN ('expected', 'late', 'checked_in', 'no_show'));

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

CREATE INDEX IF NOT EXISTS idx_doctors_clinic_active ON doctors(clinic_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_range ON appointments(doctor_id, starts_at, ends_at) WHERE deleted_at IS NULL AND status NOT IN ('cancelled', 'no_show');

COMMIT;
