-- Manual local-market billing system (trial + cash/shamcash + admin approvals)

BEGIN;

CREATE TABLE IF NOT EXISTS clinic_local_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'trial',
  trial_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + interval '3 days'),
  active_started_at TIMESTAMPTZ,
  next_renewal_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  suspension_reason TEXT,
  base_price_usd NUMERIC(10,2) NOT NULL DEFAULT 120,
  included_doctors INTEGER NOT NULL DEFAULT 1,
  extra_doctor_price_usd NUMERIC(10,2) NOT NULL DEFAULT 30,
  last_paid_amount_usd NUMERIC(10,2),
  last_paid_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('trial', 'active', 'suspended', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_local_subscriptions_status ON clinic_local_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_local_subscriptions_renewal ON clinic_local_subscriptions(next_renewal_at);

CREATE TABLE IF NOT EXISTS clinic_payment_requests (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  subscription_id BIGINT REFERENCES clinic_local_subscriptions(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL DEFAULT 'renewal',
  payment_method TEXT NOT NULL,
  amount_usd NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  receipt_url TEXT,
  reference_code TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (payment_method IN ('cash', 'shamcash', 'manual_transfer')),
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_clinic ON clinic_payment_requests(clinic_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON clinic_payment_requests(status, requested_at DESC);

CREATE TABLE IF NOT EXISTS billing_notification_log (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  subscription_id BIGINT REFERENCES clinic_local_subscriptions(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  kind TEXT NOT NULL,
  target TEXT,
  message_text TEXT,
  send_ok BOOLEAN NOT NULL DEFAULT FALSE,
  send_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_notifications_clinic ON billing_notification_log(clinic_id, created_at DESC);

COMMIT;
