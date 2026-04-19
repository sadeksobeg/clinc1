-- Allow terminal "blocked" status for policy / HARD DROP rows (reactive WhatsApp).
BEGIN;

ALTER TABLE core_outbox DROP CONSTRAINT IF EXISTS core_outbox_status_check;

ALTER TABLE core_outbox
  ADD CONSTRAINT core_outbox_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead', 'blocked'));

DROP INDEX IF EXISTS idx_core_outbox_drain;

CREATE INDEX idx_core_outbox_drain
  ON core_outbox (status, available_at)
  WHERE status IN ('pending', 'failed') AND attempts < 25;

COMMIT;
