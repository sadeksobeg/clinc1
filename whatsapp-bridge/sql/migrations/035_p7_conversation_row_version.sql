-- P7 optimistic concurrency helper for hot conversation rows (optional use in app).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS row_version INT NOT NULL DEFAULT 1;

COMMENT ON COLUMN conversations.row_version IS 'Incremented by app on guarded updates to detect concurrent writes (P7).';
