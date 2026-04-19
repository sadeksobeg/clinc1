-- Dev seed: ops dashboard login (password: changeme) — change email/password in production.
-- Run after crm-bootstrap or multitenant migrations.
INSERT INTO staff_users (clinic_id, email, display_name, role, password_hash, is_active)
VALUES (
  1,
  'ops@local.test',
  'Ops Admin',
  'admin',
  '$2a$10$h4BWwSs8r7uxzBu1fGMoYuL8RfA3t47CWszOekNf1.4oeB6GwIbDm',
  TRUE
)
ON CONFLICT (clinic_id, email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = TRUE;
