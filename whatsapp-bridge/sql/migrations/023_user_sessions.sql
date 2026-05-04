ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  token_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, token_version) WHERE revoked_at IS NULL;
