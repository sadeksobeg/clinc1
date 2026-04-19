-- Enterprise CRM + cases extensions (run after 001_multitenant.sql; safe on older schemas)
BEGIN;

ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;
ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_role_check
  CHECK (role IN ('admin', 'operator', 'viewer', 'staff'));

ALTER TABLE patients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'ar';

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'no_show', 'completed'));

ALTER TABLE cases ADD COLUMN IF NOT EXISTS assigned_to BIGINT REFERENCES staff_users(id) ON DELETE SET NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'open';

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_workflow_status_check;
ALTER TABLE cases
  ADD CONSTRAINT cases_workflow_status_check
  CHECK (workflow_status IN ('open', 'triaged', 'in_progress', 'waiting_patient', 'resolved', 'closed'));

CREATE INDEX IF NOT EXISTS idx_patients_clinic_blacklist ON patients(clinic_id, is_blacklisted) WHERE is_blacklisted = TRUE;
CREATE INDEX IF NOT EXISTS idx_patients_clinic_vip ON patients(clinic_id, is_vip) WHERE is_vip = TRUE;
CREATE INDEX IF NOT EXISTS idx_cases_assigned ON cases(assigned_to, workflow_status);
CREATE INDEX IF NOT EXISTS idx_cases_sla ON cases(sla_deadline) WHERE workflow_status <> 'closed';

COMMIT;
