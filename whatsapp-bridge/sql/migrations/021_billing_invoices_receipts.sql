BEGIN;

CREATE TABLE IF NOT EXISTS billing_invoices (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  subscription_id BIGINT REFERENCES clinic_local_subscriptions(id) ON DELETE SET NULL,
  payment_request_id BIGINT UNIQUE REFERENCES clinic_payment_requests(id) ON DELETE SET NULL,
  invoice_no TEXT NOT NULL UNIQUE,
  period_start DATE,
  period_end DATE,
  due_at TIMESTAMPTZ,
  amount_usd NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'issued',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('draft', 'issued', 'paid', 'voided'))
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_clinic
  ON billing_invoices(clinic_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS billing_receipts (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  invoice_id BIGINT NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  payment_request_id BIGINT UNIQUE REFERENCES clinic_payment_requests(id) ON DELETE SET NULL,
  receipt_no TEXT NOT NULL UNIQUE,
  payment_method TEXT NOT NULL,
  amount_usd NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference_code TEXT,
  receipt_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_receipts_clinic
  ON billing_receipts(clinic_id, paid_at DESC);

COMMIT;
