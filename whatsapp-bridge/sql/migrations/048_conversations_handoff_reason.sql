-- AI / staff handoff reason on conversations (additive).

BEGIN;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS handoff_reason TEXT;

COMMIT;
