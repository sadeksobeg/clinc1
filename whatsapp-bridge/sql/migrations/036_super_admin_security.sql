BEGIN;

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;
ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_role_check
  CHECK (role IN ('admin', 'operator', 'viewer', 'staff', 'secretary', 'doctor', 'owner', 'ops_admin', 'ops_manager', 'super_admin'));

ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS require_mfa BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS security_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS user_mfa_secrets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  secret_key TEXT NOT NULL,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS user_ip_allowlist (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  ip_cidr TEXT NOT NULL,
  note TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_ip_allowlist_user_active
  ON user_ip_allowlist(user_id, is_active);

COMMIT;
