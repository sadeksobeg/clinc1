-- Indexes for inbox visibility on routing.selected_clinic_id (Hub → branch routing).

BEGIN;

CREATE INDEX IF NOT EXISTS idx_conversations_routing_selected_clinic
  ON conversations (((routing->>'selected_clinic_id')::bigint))
  WHERE (routing->>'selected_clinic_id') ~ '^[0-9]+$';

CREATE INDEX IF NOT EXISTS idx_conversations_routing_gin
  ON conversations USING gin (routing);

COMMIT;
