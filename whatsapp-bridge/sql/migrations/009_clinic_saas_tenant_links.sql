-- Links CRM clinic (bigint) to .NET SaaS tenant (UUID) for hybrid billing / platform admin.
-- Safe to run on existing DBs: CREATE IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS clinic_saas_tenant_links (
  clinic_id BIGINT PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  tenant_guid UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_saas_tenant_links_tenant ON clinic_saas_tenant_links(tenant_guid);

COMMENT ON TABLE clinic_saas_tenant_links IS 'Maps ops CRM clinic_id to ClinicSaaS Tenants.Id (UUID). One row per clinic.';

COMMIT;
