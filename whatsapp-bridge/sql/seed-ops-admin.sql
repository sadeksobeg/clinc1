-- Dev seed only: rotate credentials before any non-local environment.
-- Password for this hash is intentionally undocumented; generate your own via:
--   cd ops-dashboard && npm run hash-password -- "<STRONG_PASSWORD>"
-- Run after crm-bootstrap or multitenant migrations.
INSERT INTO staff_users (clinic_id, email, display_name, role, password_hash, is_active)
VALUES (
  1,
  'ops-seed-change@local.invalid',
  'Ops Admin',
  'admin',
  '$2a$10$cqCx17PQ6TWtDdcFVYBi0OKn1XPfHRV7KZ1T/6f6iVdDRh5AYrAi2',
  TRUE
)
ON CONFLICT (clinic_id, email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = TRUE;
