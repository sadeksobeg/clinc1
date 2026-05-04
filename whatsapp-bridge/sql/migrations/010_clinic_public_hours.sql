-- Optional per-clinic public reception hours (0=Sunday .. 6=Saturday in Luxon weekday).
-- If a clinic has zero rows here, booking flow treats clinic as always open (backward compatible).

BEGIN;

CREATE TABLE IF NOT EXISTS clinic_public_hours (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  opens_at TIME,
  closes_at TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_clinic_public_hours_clinic ON clinic_public_hours(clinic_id);

COMMENT ON TABLE clinic_public_hours IS 'Public-facing hours for AI closed/open replies; independent of doctor_working_hours.';

COMMIT;
