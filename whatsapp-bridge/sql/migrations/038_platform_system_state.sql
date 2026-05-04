CREATE TABLE IF NOT EXISTS platform_system_state (
  id INT PRIMARY KEY DEFAULT 1,
  global_status TEXT NOT NULL DEFAULT 'healthy' CHECK (global_status IN ('healthy', 'degraded', 'incident', 'maintenance')),
  severity INT NOT NULL DEFAULT 0 CHECK (severity >= 0 AND severity <= 3),
  active_incidents_count INT NOT NULL DEFAULT 0,
  critical_incidents_count INT NOT NULL DEFAULT 0,
  affected_clinics_count INT NOT NULL DEFAULT 0,
  components JSONB NOT NULL DEFAULT '{}'::jsonb,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (id = 1)
);

INSERT INTO platform_system_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_component_states (
  component_key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'down')),
  severity INT NOT NULL DEFAULT 0 CHECK (severity >= 0 AND severity <= 3),
  latency_ms INT NULL,
  error_rate NUMERIC NULL,
  source TEXT NOT NULL DEFAULT 'computed',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_component_states_updated_at
  ON platform_component_states(updated_at DESC);

