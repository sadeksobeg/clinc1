CREATE TABLE IF NOT EXISTS production_simulation_runs (
  id BIGSERIAL PRIMARY KEY,
  scenario_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'passed', 'failed')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_simulation_runs_started ON production_simulation_runs(started_at DESC);
