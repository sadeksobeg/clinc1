CREATE TABLE IF NOT EXISTS trial_identity_fingerprints (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email_hash TEXT NULL,
  whatsapp_hash TEXT NULL,
  ip_hash TEXT NULL,
  browser_fingerprint_hash TEXT NULL,
  domain_hash TEXT NULL,
  vat_hash TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trial_identity_email ON trial_identity_fingerprints(email_hash);
CREATE INDEX IF NOT EXISTS idx_trial_identity_whatsapp ON trial_identity_fingerprints(whatsapp_hash);
CREATE INDEX IF NOT EXISTS idx_trial_identity_ip ON trial_identity_fingerprints(ip_hash);
CREATE INDEX IF NOT EXISTS idx_trial_identity_browser ON trial_identity_fingerprints(browser_fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_trial_identity_domain ON trial_identity_fingerprints(domain_hash);
CREATE INDEX IF NOT EXISTS idx_trial_identity_vat ON trial_identity_fingerprints(vat_hash);
