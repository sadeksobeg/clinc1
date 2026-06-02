-- Map the bridge's WhatsApp business line (Syria) to hub clinic 1.
-- Local: 0939448113 → E.164: +963939448113
-- Idempotent via ON CONFLICT (to_number).

BEGIN;

INSERT INTO whatsapp_inbound_routes (to_number, hub_clinic_id, allowed_clinic_ids, is_active, notes)
VALUES (
  '+963939448113',
  1,
  ARRAY[1]::bigint[],
  TRUE,
  'Syria bridge line 0939448113 (E.164 +963939448113)'
)
ON CONFLICT (to_number) DO UPDATE
  SET hub_clinic_id = EXCLUDED.hub_clinic_id,
      allowed_clinic_ids = EXCLUDED.allowed_clinic_ids,
      is_active = TRUE,
      updated_at = NOW();

COMMIT;
