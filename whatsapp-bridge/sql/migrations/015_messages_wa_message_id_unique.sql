-- WhatsApp (and other channels) stable message id for idempotency beyond dedupe_hash.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_clinic_message_id_unique
  ON messages (clinic_id, message_id)
  WHERE message_id IS NOT NULL AND trim(message_id) <> '';

COMMIT;
