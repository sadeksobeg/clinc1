-- Extended patient demographics (nullable for existing rows).

BEGIN;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_note TEXT;

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_gender_check;
ALTER TABLE patients ADD CONSTRAINT patients_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female', 'other', 'unknown'));

COMMIT;
