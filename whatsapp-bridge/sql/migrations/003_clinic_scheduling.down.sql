-- Revert 003_clinic_scheduling (destructive: drops scheduling tables and columns)
BEGIN;

DROP TABLE IF EXISTS clinic_day_queue_state;
DROP TABLE IF EXISTS notification_outbox;
DROP TABLE IF EXISTS reschedule_logs;

DROP INDEX IF EXISTS idx_appointments_idempotency_key;
DROP INDEX IF EXISTS idx_appointments_doctor_range;
DROP INDEX IF EXISTS idx_doctors_clinic_active;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patient_arrival_state_check;
ALTER TABLE appointments DROP COLUMN IF EXISTS idempotency_key;
ALTER TABLE appointments DROP COLUMN IF EXISTS policy_snapshot;
ALTER TABLE appointments DROP COLUMN IF EXISTS confirmed_at;
ALTER TABLE appointments DROP COLUMN IF EXISTS patient_arrival_state;
ALTER TABLE appointments DROP COLUMN IF EXISTS sequence_no;
ALTER TABLE appointments DROP COLUMN IF EXISTS visit_kind;
ALTER TABLE appointments DROP COLUMN IF EXISTS specialty_requested;
ALTER TABLE appointments DROP COLUMN IF EXISTS doctor_id;

DROP TABLE IF EXISTS doctor_leaves;
DROP TABLE IF EXISTS doctor_working_hours;
DROP TABLE IF EXISTS doctors;

ALTER TABLE conversations DROP COLUMN IF EXISTS routing;

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;
ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_role_check
  CHECK (role IN ('admin', 'operator', 'viewer', 'staff'));

COMMIT;
