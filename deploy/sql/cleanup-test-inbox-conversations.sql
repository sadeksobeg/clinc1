-- Remove disposable WhatsApp test patients/conversations from clinic_ops (production cleanup).
-- Run only against clinic_ops. Review rows before COMMIT.

BEGIN;

CREATE TEMP TABLE _test_patients AS
SELECT id
FROM patients
WHERE chat_id ILIKE '%@lid'
  AND (
    chat_id ILIKE 'test@%'
    OR chat_id ILIKE 'finalcheck@%'
    OR chat_id ILIKE 'verify@%'
    OR display_name ILIKE 'verify-script%'
  );

SELECT p.id, p.chat_id, p.display_name, COUNT(c.id) AS conversations
FROM patients p
LEFT JOIN conversations c ON c.patient_id = p.id
WHERE p.id IN (SELECT id FROM _test_patients)
GROUP BY p.id, p.chat_id, p.display_name;

DELETE FROM messages
WHERE conversation_id IN (
  SELECT c.id FROM conversations c WHERE c.patient_id IN (SELECT id FROM _test_patients)
);

DELETE FROM conversations
WHERE patient_id IN (SELECT id FROM _test_patients);

DELETE FROM patients
WHERE id IN (SELECT id FROM _test_patients);

COMMIT;
