BEGIN;

DROP INDEX IF EXISTS idx_core_outbox_drain;
DROP TABLE IF EXISTS core_outbox;

ALTER TABLE conversations DROP COLUMN IF EXISTS dialogue_version;
ALTER TABLE conversations DROP COLUMN IF EXISTS dialogue_state;

COMMIT;
