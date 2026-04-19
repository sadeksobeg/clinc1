=WITH existing_message AS (
  SELECT id FROM messages WHERE clinic_id = {{$json.clinic_id}}::bigint AND dedupe_hash = '{{$json.dedupeHash}}' LIMIT 1
), upsert_patient AS (
  INSERT INTO patients (clinic_id, chat_id, status, first_seen_at, last_seen_at, updated_at)
  VALUES ({{$json.clinic_id}}::bigint, '{{$json.from}}', 'new', NOW(), NOW(), NOW())
  ON CONFLICT (clinic_id, chat_id) DO UPDATE SET last_seen_at = NOW(), updated_at = NOW()
  RETURNING id, status
), selected_patient AS (
  SELECT id, status FROM upsert_patient
  UNION ALL
  SELECT p.id, p.status FROM patients p WHERE p.chat_id = '{{$json.from}}' AND p.clinic_id = {{$json.clinic_id}}::bigint LIMIT 1
), active_conversation AS (
  SELECT c.id, c.state
  FROM conversations c
  WHERE c.clinic_id = {{$json.clinic_id}}::bigint
    AND c.patient_id = (SELECT id FROM selected_patient LIMIT 1)
    AND c.status = 'open'
  ORDER BY c.id DESC
  LIMIT 1
), opened_conversation AS (
  INSERT INTO conversations (clinic_id, patient_id, channel, status, state, opened_at, created_at, updated_at)
  SELECT {{$json.clinic_id}}::bigint, id, 'whatsapp', 'open', 'NEW', NOW(), NOW(), NOW()
  FROM selected_patient
  WHERE NOT EXISTS (SELECT 1 FROM active_conversation)
  RETURNING id, state
), selected_conversation AS (
  SELECT id, state FROM active_conversation
  UNION ALL
  SELECT id, state FROM opened_conversation
  LIMIT 1
), inserted_message AS (
  INSERT INTO messages (
    clinic_id, conversation_id, patient_id, message_id, dedupe_hash, direction, text, intent, priority, is_urgent, dedup_skipped, source, payload, created_at
  )
  SELECT
    {{$json.clinic_id}}::bigint,
    (SELECT id FROM selected_conversation),
    (SELECT id FROM selected_patient),
    NULLIF('{{$json.messageId}}', ''),
    '{{$json.dedupeHash}}',
    'inbound',
    $${{$json.text}}$$,
    '{{$json.ruleIntent}}',
    {{$json.rulePriority}},
    {{$json.ruleIntent === 'URGENT' ? 'true' : 'false'}},
    false,
    'n8n',
    '{}'::jsonb,
    NOW()
  WHERE NOT EXISTS (SELECT 1 FROM existing_message)
  RETURNING id
)
SELECT
  EXISTS(SELECT 1 FROM existing_message) AS is_duplicate,
  {{$json.clinic_id}}::bigint AS clinic_id,
  (SELECT id FROM selected_patient) AS patient_id,
  (SELECT status FROM selected_patient LIMIT 1) AS patient_status,
  (SELECT id FROM selected_conversation) AS conversation_id,
  COALESCE((SELECT id FROM inserted_message), (SELECT id FROM existing_message)) AS inbound_message_id,
  COALESCE((SELECT state FROM selected_conversation LIMIT 1), 'NEW') AS conversation_state,
  '{{$json.from}}' AS "from",
  $${{$json.text}}$$ AS "text",
  '{{$json.ruleIntent}}' AS "ruleIntent",
  {{$json.rulePriority}} AS "rulePriority",
  {{$json.ruleHandoff ? 'true' : 'false'}} AS "ruleHandoff",
  $${{$json.fallbackReply}}$$ AS "fallbackReply",
  {{$json.outsideHours ? 'true' : 'false'}} AS "outsideHours",
  '{{$json.receivedAt}}' AS "receivedAt",
  '{{$json.alertTo}}' AS "alertTo",
  '{{$json.dedupeHash}}' AS "dedupeHash",
  {{ $json.workflowStartedAt !== undefined && $json.workflowStartedAt !== null ? (Date.now() - $json.workflowStartedAt) : 0 }} AS "workflow_latency_ms";
