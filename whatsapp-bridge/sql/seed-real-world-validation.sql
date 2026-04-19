-- Rich demo data for E2E validation (after 003 + seed-scheduling-demo).
-- Clinic 1, doctor "د. تجريبي — عام", three patients + three appointments today (clinic TZ).

INSERT INTO patients (clinic_id, chat_id, display_name, status)
SELECT 1, 'demo-rw-patient-1', 'مريض تجريبي أحمد', 'new'
WHERE NOT EXISTS (SELECT 1 FROM patients WHERE clinic_id = 1 AND chat_id = 'demo-rw-patient-1');

INSERT INTO patients (clinic_id, chat_id, display_name, status)
SELECT 1, 'demo-rw-patient-2', 'مريض تجريبي سارة', 'new'
WHERE NOT EXISTS (SELECT 1 FROM patients WHERE clinic_id = 1 AND chat_id = 'demo-rw-patient-2');

INSERT INTO patients (clinic_id, chat_id, display_name, status)
SELECT 1, 'demo-rw-patient-3', 'مريض تجريبي خالد', 'new'
WHERE NOT EXISTS (SELECT 1 FROM patients WHERE clinic_id = 1 AND chat_id = 'demo-rw-patient-3');

DO $$
DECLARE
  tz text := COALESCE((SELECT timezone FROM clinics WHERE id = 1 LIMIT 1), 'Asia/Amman');
  d_id bigint;
  day0 timestamptz;
  p1 bigint;
  p2 bigint;
  p3 bigint;
BEGIN
  SELECT id INTO d_id FROM doctors
  WHERE clinic_id = 1 AND display_name = 'د. تجريبي — عام' AND deleted_at IS NULL
  LIMIT 1;
  IF d_id IS NULL THEN
    RAISE NOTICE 'seed-real-world-validation: demo doctor not found; run seed-scheduling-demo.sql';
    RETURN;
  END IF;

  day0 := (date_trunc('day', clock_timestamp() AT TIME ZONE tz) AT TIME ZONE tz);

  SELECT id INTO p1 FROM patients WHERE clinic_id = 1 AND chat_id = 'demo-rw-patient-1' LIMIT 1;
  SELECT id INTO p2 FROM patients WHERE clinic_id = 1 AND chat_id = 'demo-rw-patient-2' LIMIT 1;
  SELECT id INTO p3 FROM patients WHERE clinic_id = 1 AND chat_id = 'demo-rw-patient-3' LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM appointments
    WHERE patient_id = p1 AND doctor_id = d_id AND starts_at = day0 + interval '3 hours' AND deleted_at IS NULL
  ) THEN
    INSERT INTO appointments (
      clinic_id, patient_id, doctor_id, starts_at, ends_at, status,
      patient_arrival_state, source_channel, specialty_requested
    ) VALUES (
      1, p1, d_id, day0 + interval '3 hours', day0 + interval '3 hours 15 minutes', 'confirmed',
      'late', 'seed_validation', 'general'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM appointments
    WHERE patient_id = p2 AND doctor_id = d_id AND starts_at = day0 + interval '4 hours' AND deleted_at IS NULL
  ) THEN
    INSERT INTO appointments (
      clinic_id, patient_id, doctor_id, starts_at, ends_at, status,
      patient_arrival_state, source_channel, specialty_requested
    ) VALUES (
      1, p2, d_id, day0 + interval '4 hours', day0 + interval '4 hours 15 minutes', 'confirmed',
      'expected', 'seed_validation', 'general'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM appointments
    WHERE patient_id = p3 AND doctor_id = d_id AND starts_at = day0 + interval '5 hours 30 minutes' AND deleted_at IS NULL
  ) THEN
    INSERT INTO appointments (
      clinic_id, patient_id, doctor_id, starts_at, ends_at, status,
      patient_arrival_state, source_channel, specialty_requested
    ) VALUES (
      1, p3, d_id, day0 + interval '5 hours 30 minutes', day0 + interval '5 hours 45 minutes', 'pending',
      'expected', 'seed_validation', 'general'
    );
  END IF;
END $$;
