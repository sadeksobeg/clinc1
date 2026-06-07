-- Index for inbox / routing on locked_clinic_id (clinic routing guard).
BEGIN;

CREATE INDEX IF NOT EXISTS idx_conversations_routing_locked_clinic
  ON conversations (((routing->>'locked_clinic_id')::bigint))
  WHERE (routing->>'locked_clinic_id') ~ '^[0-9]+$';

COMMIT;
