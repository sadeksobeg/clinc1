CREATE TABLE IF NOT EXISTS system_runtime_flags (
  flag_key TEXT PRIMARY KEY,
  flag_value TEXT NOT NULL CHECK (flag_value IN ('on', 'off')),
  updated_by TEXT NULL,
  reason TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_runtime_flags (flag_key, flag_value, updated_by, reason)
VALUES
  ('whatsapp_send_disabled', 'off', 'migration_033', 'default'),
  ('ai_autoreply_disabled', 'off', 'migration_033', 'default'),
  ('auto_booking_disabled', 'off', 'migration_033', 'default'),
  ('emergency_global_disable', 'off', 'migration_033', 'default')
ON CONFLICT (flag_key) DO NOTHING;
