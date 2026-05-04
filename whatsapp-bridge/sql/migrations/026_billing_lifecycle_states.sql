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

UPDATE clinic_local_subscriptions
SET status = 'trial_expired'
WHERE status = 'expired';

ALTER TABLE clinic_local_subscriptions
  ADD CONSTRAINT clinic_local_subscriptions_status_check
  CHECK (status IN ('trial', 'trial_expiring', 'trial_expired', 'active', 'past_due', 'grace', 'suspended', 'cancelled'));

COMMIT;