-- Multi-clinic WhatsApp routing: specialties catalog + clinic/doctor links,
-- inbound-number routing, outbound audit, per-number warm-up state.
-- Adds nothing destructive; backfills doctor_specialties from existing doctors.specialty TEXT.
BEGIN;

-- 1) Global specialties catalog (Arabic + English labels, ordering, soft-deactivate)
CREATE TABLE IF NOT EXISTS specialties (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label_ar TEXT NOT NULL,
  label_en TEXT NULL,
  icon TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_specialties_active_sort
  ON specialties(is_active, sort_order, id) WHERE is_active = TRUE;

-- 2) Which specialties each clinic offers (admin can enable/disable per clinic)
CREATE TABLE IF NOT EXISTS clinic_specialties (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  specialty_id BIGINT NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, specialty_id)
);

CREATE INDEX IF NOT EXISTS idx_clinic_specialties_clinic
  ON clinic_specialties(clinic_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_clinic_specialties_specialty
  ON clinic_specialties(specialty_id) WHERE is_active = TRUE;

-- 3) Many-to-many doctors ↔ specialties (a dentist might also have a sub-specialty)
CREATE TABLE IF NOT EXISTS doctor_specialties (
  id BIGSERIAL PRIMARY KEY,
  doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  specialty_id BIGINT NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (doctor_id, specialty_id)
);

CREATE INDEX IF NOT EXISTS idx_doctor_specialties_doctor
  ON doctor_specialties(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_specialties_specialty
  ON doctor_specialties(specialty_id);

-- 4) WhatsApp inbound routes — one row per WA business number on the bridge.
-- Maps to_number → hub clinic (default for new patients before they pick) + the
-- set of clinics this number is allowed to route into.
CREATE TABLE IF NOT EXISTS whatsapp_inbound_routes (
  id BIGSERIAL PRIMARY KEY,
  to_number TEXT NOT NULL UNIQUE,
  hub_clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  allowed_clinic_ids BIGINT[] NOT NULL DEFAULT '{}',
  welcome_message_ar TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_routes_active
  ON whatsapp_inbound_routes(is_active);

-- 5) Outbound audit — every send attempt, success or block. Used by the
-- broadcast-pattern detector, daily caps, and the super-admin health panel.
CREATE TABLE IF NOT EXISTS wa_send_audit (
  id BIGSERIAL PRIMARY KEY,
  chat_id TEXT NOT NULL,
  to_number TEXT NULL,
  clinic_id BIGINT NULL REFERENCES clinics(id) ON DELETE SET NULL,
  doctor_id BIGINT NULL REFERENCES doctors(id) ON DELETE SET NULL,
  text_hash TEXT NOT NULL,
  text_length INTEGER NOT NULL DEFAULT 0,
  has_link BOOLEAN NOT NULL DEFAULT FALSE,
  send_kind TEXT NOT NULL DEFAULT 'patient_reply',
  provider TEXT NOT NULL DEFAULT 'whatsapp_web_js',
  status TEXT NOT NULL,
  blocked_reason TEXT NULL,
  latency_ms INTEGER NULL,
  correlation_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('sent','retry','failed','blocked','dropped'))
);

CREATE INDEX IF NOT EXISTS idx_wa_send_audit_chat_time
  ON wa_send_audit(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_send_audit_text_hash_time
  ON wa_send_audit(text_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_send_audit_status_time
  ON wa_send_audit(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_send_audit_clinic_time
  ON wa_send_audit(clinic_id, created_at DESC) WHERE clinic_id IS NOT NULL;

-- 6) Per WA-number state for warm-up policy (caps ramp over 7 days after pairing)
CREATE TABLE IF NOT EXISTS wa_number_state (
  id BIGSERIAL PRIMARY KEY,
  to_number TEXT NOT NULL UNIQUE,
  paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_disconnected_at TIMESTAMPTZ NULL,
  last_connected_at TIMESTAMPTZ NULL,
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_reason TEXT NULL,
  paused_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7) Backfill specialties + doctor_specialties from existing doctors.specialty TEXT.
-- Idempotent — re-running is safe.
INSERT INTO specialties (code, label_ar, label_en, sort_order)
SELECT DISTINCT
  LOWER(TRIM(d.specialty)) AS code,
  CASE LOWER(TRIM(d.specialty))
    WHEN 'general'    THEN 'طب عام'
    WHEN 'dentist'    THEN 'طب أسنان'
    WHEN 'dental'     THEN 'طب أسنان'
    WHEN 'pediatric'  THEN 'طب أطفال'
    WHEN 'pediatrics' THEN 'طب أطفال'
    WHEN 'cardiology' THEN 'قلب وأوعية'
    WHEN 'dermatology' THEN 'جلدية'
    WHEN 'orthopedic' THEN 'عظام'
    WHEN 'orthopedics' THEN 'عظام'
    WHEN 'ent'        THEN 'أنف وأذن وحنجرة'
    WHEN 'ophthalmology' THEN 'عيون'
    WHEN 'gynecology' THEN 'نسائية'
    WHEN 'urology'    THEN 'مسالك'
    WHEN 'neurology'  THEN 'أعصاب'
    WHEN 'psychiatry' THEN 'نفسي'
    ELSE COALESCE(NULLIF(TRIM(d.specialty), ''), 'عام')
  END AS label_ar,
  NULLIF(LOWER(TRIM(d.specialty)), '') AS label_en,
  100 AS sort_order
FROM doctors d
WHERE d.specialty IS NOT NULL AND TRIM(d.specialty) <> ''
ON CONFLICT (code) DO NOTHING;

-- Ensure a fallback "عام" specialty always exists
INSERT INTO specialties (code, label_ar, label_en, sort_order)
VALUES ('general', 'طب عام', 'general', 10)
ON CONFLICT (code) DO NOTHING;

-- Link every active doctor to its primary specialty
INSERT INTO doctor_specialties (doctor_id, specialty_id, is_primary)
SELECT d.id, s.id, TRUE
FROM doctors d
JOIN specialties s ON s.code = LOWER(TRIM(COALESCE(NULLIF(d.specialty, ''), 'general')))
WHERE d.deleted_at IS NULL
ON CONFLICT (doctor_id, specialty_id) DO NOTHING;

-- Auto-enable each clinic's specialties from its doctors
INSERT INTO clinic_specialties (clinic_id, specialty_id, is_active)
SELECT DISTINCT d.clinic_id, ds.specialty_id, TRUE
FROM doctors d
JOIN doctor_specialties ds ON ds.doctor_id = d.id
WHERE d.deleted_at IS NULL AND d.is_active = TRUE
ON CONFLICT (clinic_id, specialty_id) DO NOTHING;

COMMIT;
