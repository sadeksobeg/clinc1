-- Rollback helper (manual review before run)
BEGIN;

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_workflow_status_check;
ALTER TABLE cases DROP COLUMN IF EXISTS workflow_status;
ALTER TABLE cases DROP COLUMN IF EXISTS sla_deadline;
ALTER TABLE cases DROP COLUMN IF EXISTS assigned_to;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE appointments DROP COLUMN IF EXISTS no_show;
ALTER TABLE appointments DROP COLUMN IF EXISTS cancelled_at;
ALTER TABLE appointments DROP COLUMN IF EXISTS reminder_sent_at;

ALTER TABLE patients DROP COLUMN IF EXISTS preferred_language;
ALTER TABLE patients DROP COLUMN IF EXISTS is_vip;
ALTER TABLE patients DROP COLUMN IF EXISTS is_blacklisted;
ALTER TABLE patients DROP COLUMN IF EXISTS notes;

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;

COMMIT;
