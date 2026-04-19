-- Demo doctor + working hours for clinic 1 (after 003 or fresh bootstrap)
INSERT INTO doctors (clinic_id, display_name, specialty, slot_duration_minutes, is_active)
SELECT 1, 'د. تجريبي — عام', 'general', 15, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM doctors WHERE clinic_id = 1 AND display_name = 'د. تجريبي — عام' AND deleted_at IS NULL
);

INSERT INTO doctor_working_hours (doctor_id, weekday, opens_at, closes_at)
SELECT d.id, w.d, t.opens, t.closes
FROM doctors d
CROSS JOIN (VALUES (0::smallint), (1), (2), (3), (4), (5), (6)) AS w(d)
CROSS JOIN (VALUES (TIME '16:00', TIME '22:00')) AS t(opens, closes)
WHERE d.clinic_id = 1 AND d.display_name = 'د. تجريبي — عام' AND d.deleted_at IS NULL
  AND w.d <> 5
ON CONFLICT (doctor_id, weekday) DO NOTHING;
