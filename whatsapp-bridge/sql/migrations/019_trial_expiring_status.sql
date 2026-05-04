BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'clinic_local_subscriptions'
      AND constraint_name = 'clinic_local_subscriptions_status_check'
  ) THEN
    ALTER TABLE clinic_local_subscriptions
      DROP CONSTRAINT clinic_local_subscriptions_status_check;
  END IF;
END $$;

-- Normalize legacy / out-of-order migration values before adding the stricter check
UPDATE clinic_local_subscriptions
SET status = 'expired'
WHERE status = 'trial_expired';

UPDATE clinic_local_subscriptions
SET status = 'active'
WHERE status IN ('past_due', 'grace');

UPDATE clinic_local_subscriptions
SET status = 'trial'
WHERE status IS NULL
   OR trim(status) = ''
   OR status NOT IN ('trial', 'trial_expiring', 'active', 'suspended', 'expired', 'cancelled');

ALTER TABLE clinic_local_subscriptions
  ADD CONSTRAINT clinic_local_subscriptions_status_check
  CHECK (status IN ('trial', 'trial_expiring', 'active', 'suspended', 'expired', 'cancelled'));

COMMIT;
