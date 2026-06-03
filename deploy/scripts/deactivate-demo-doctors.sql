-- إخفاء أطباء البذرة (تجريبي / demo) من الحجز — شغّل مرة على clinic_ops
BEGIN;
UPDATE doctors
SET is_active = FALSE, updated_at = NOW()
WHERE deleted_at IS NULL
  AND is_active = TRUE
  AND (
    display_name ILIKE '%تجريبي%'
    OR display_name ILIKE '%demo%'
    OR display_name ILIKE 'Doctor %'
  );
COMMIT;
