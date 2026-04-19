-- Migration: multi-tenant + appointments + audit + staff (run AFTER legacy crm-bootstrap.sql)
-- PostgreSQL 13+

BEGIN;

CREATE TABLE IF NOT EXISTS clinics (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Amman',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO clinics (slug, name)
SELECT 'default', 'Default Clinic'
WHERE NOT EXISTS (SELECT 1 FROM clinics WHERE slug = 'default');

SELECT setval(
  pg_get_serial_sequence('clinics', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM clinics), 1)
);

CREATE TABLE IF NOT EXISTS staff_users (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff',
  external_auth_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, email)
);

CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id BIGINT REFERENCES patients(id) ON DELETE SET NULL,
  conversation_id BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source_channel TEXT NOT NULL DEFAULT 'whatsapp',
  notes TEXT,
  staff_user_id BIGINT REFERENCES staff_users(id) ON DELETE SET NULL,
  google_event_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  clinic_id BIGINT REFERENCES clinics(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- patients.clinic_id
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id BIGINT REFERENCES clinics(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
UPDATE patients SET clinic_id = (SELECT id FROM clinics WHERE slug = 'default' LIMIT 1) WHERE clinic_id IS NULL;
ALTER TABLE patients ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE patients ALTER COLUMN clinic_id SET DEFAULT 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_chat_id_key'
  ) THEN
    ALTER TABLE patients DROP CONSTRAINT patients_chat_id_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_clinic_chat ON patients(clinic_id, chat_id);

-- conversations.clinic_id
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS clinic_id BIGINT REFERENCES clinics(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
UPDATE conversations c
SET clinic_id = p.clinic_id
FROM patients p
WHERE c.patient_id = p.id AND c.clinic_id IS NULL;
UPDATE conversations SET clinic_id = (SELECT id FROM clinics WHERE slug = 'default' LIMIT 1) WHERE clinic_id IS NULL;
ALTER TABLE conversations ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE conversations ALTER COLUMN clinic_id SET DEFAULT 1;

-- messages.clinic_id
ALTER TABLE messages ADD COLUMN IF NOT EXISTS clinic_id BIGINT REFERENCES clinics(id);
UPDATE messages m
SET clinic_id = c.clinic_id
FROM conversations c
WHERE m.conversation_id = c.id AND m.clinic_id IS NULL;
UPDATE messages SET clinic_id = (SELECT id FROM clinics WHERE slug = 'default' LIMIT 1) WHERE clinic_id IS NULL;
ALTER TABLE messages ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN clinic_id SET DEFAULT 1;

DROP INDEX IF EXISTS idx_messages_dedupe_hash;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_clinic_dedupe_hash
  ON messages(clinic_id, dedupe_hash)
  WHERE dedupe_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_clinic_created_at ON messages(clinic_id, created_at DESC);

-- alerts
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS clinic_id BIGINT REFERENCES clinics(id);
UPDATE alerts a SET clinic_id = c.clinic_id FROM conversations c WHERE a.conversation_id = c.id AND a.clinic_id IS NULL;
UPDATE alerts SET clinic_id = (SELECT id FROM clinics WHERE slug = 'default' LIMIT 1) WHERE clinic_id IS NULL;
ALTER TABLE alerts ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE alerts ALTER COLUMN clinic_id SET DEFAULT 1;

-- cases
ALTER TABLE cases ADD COLUMN IF NOT EXISTS clinic_id BIGINT REFERENCES clinics(id);
UPDATE cases k SET clinic_id = p.clinic_id FROM patients p WHERE k.patient_id = p.id AND k.clinic_id IS NULL;
UPDATE cases SET clinic_id = (SELECT id FROM clinics WHERE slug = 'default' LIMIT 1) WHERE clinic_id IS NULL;
ALTER TABLE cases ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE cases ALTER COLUMN clinic_id SET DEFAULT 1;

-- ai_decisions
ALTER TABLE ai_decisions ADD COLUMN IF NOT EXISTS clinic_id BIGINT REFERENCES clinics(id);
UPDATE ai_decisions d SET clinic_id = c.clinic_id FROM conversations c WHERE d.conversation_id = c.id AND d.clinic_id IS NULL;
UPDATE ai_decisions SET clinic_id = (SELECT id FROM clinics WHERE slug = 'default' LIMIT 1) WHERE clinic_id IS NULL;
ALTER TABLE ai_decisions ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE ai_decisions ALTER COLUMN clinic_id SET DEFAULT 1;

-- ai_health (optional tenant attribution)
ALTER TABLE ai_health ADD COLUMN IF NOT EXISTS clinic_id BIGINT REFERENCES clinics(id);
UPDATE ai_health SET clinic_id = (SELECT id FROM clinics WHERE slug = 'default' LIMIT 1) WHERE clinic_id IS NULL;
ALTER TABLE ai_health ALTER COLUMN clinic_id SET DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_last_seen ON patients(clinic_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_clinic_state ON conversations(clinic_id, state);
CREATE INDEX IF NOT EXISTS idx_audit_clinic_created ON audit_logs(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_starts ON appointments(clinic_id, starts_at);

COMMIT;
