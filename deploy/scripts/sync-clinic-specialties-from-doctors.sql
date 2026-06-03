-- ربط تخصصات العيادة من أطبائها النشطين (بعد إزالة التجريبي)
BEGIN;
INSERT INTO clinic_specialties (clinic_id, specialty_id, is_active)
SELECT DISTINCT d.clinic_id, ds.specialty_id, TRUE
FROM doctors d
JOIN doctor_specialties ds ON ds.doctor_id = d.id
WHERE d.deleted_at IS NULL AND d.is_active = TRUE
ON CONFLICT (clinic_id, specialty_id) DO UPDATE SET is_active = TRUE;
COMMIT;
