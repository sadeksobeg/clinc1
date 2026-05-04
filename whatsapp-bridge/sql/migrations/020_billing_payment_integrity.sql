BEGIN;

ALTER TABLE clinic_payment_requests
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS review_idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_payment_requests_idempotency
  ON clinic_payment_requests (clinic_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_payment_requests_review_idempotency
  ON clinic_payment_requests (review_idempotency_key)
  WHERE review_idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_processed_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_ts TIMESTAMPTZ,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed',
  error_text TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_processed_events_processed_at
  ON billing_processed_events(processed_at DESC);

COMMIT;
