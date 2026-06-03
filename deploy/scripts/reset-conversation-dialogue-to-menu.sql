-- إعادة محادثات عالقة في خطوة مواعيد قديمة إلى القائمة الرئيسية
BEGIN;
UPDATE conversations
SET dialogue_state = jsonb_build_object(
  'flow_step', 'awaiting_main_menu',
  'pending_kind', 'main_menu',
  'pending_slots', '[]'::jsonb,
  'pending_doctors', '[]'::jsonb,
  'pending_clinics', '[]'::jsonb,
  'pending_specialties', '[]'::jsonb,
  'consecutive_unparsed', 0,
  'updated_at', to_jsonb(NOW()::text)
),
updated_at = NOW()
WHERE COALESCE(dialogue_state->>'flow_step', 'idle') IN ('slot_offer', 'awaiting_confirm', 'choose_doctor', 'choose_clinic');
COMMIT;
