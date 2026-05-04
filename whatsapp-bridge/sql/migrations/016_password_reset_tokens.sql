BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  staff_user_id BIGINT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens(staff_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
  ON password_reset_tokens(expires_at);

COMMIT;
