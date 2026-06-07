/**
 * Stored in `conversations.dialogue_state` (JSONB) — booking FSM for WhatsApp.
 * `flow_step` drives the next expected patient message.
 */
export type FlowStep =
  | "idle"
  | "awaiting_main_menu"
  | "awaiting_specialty"
  | "choose_clinic"
  | "choose_doctor"
  | "slot_offer"
  | "awaiting_confirm"
  | "awaiting_display_name"
  | "awaiting_cancel_confirm"
  | "done";

export type PendingSlotOffer = {
  ix: number;
  starts_at: string;
  doctor_id: number;
  doctor_name: string;
};

export type PendingDoctorPick = {
  ix: number;
  doctor_id: number;
  display_name: string;
  specialty: string;
};

export type PendingClinicPick = {
  ix: number;
  clinic_id: number;
  name: string;
};

export type PendingSpecialtyPick = {
  ix: number;
  specialty_id: number;
  code: string;
  label_ar: string;
};

/** Persisted preference from the patient’s booking wording (see `timePreference.ts`). */
export type DialogueTimePref = "morning" | "afternoon" | "any";

export type StoredDialogueState = {
  flow_step: FlowStep;
  /** When flow_step is awaiting_display_name — which field we collect. */
  collect_field?: "display_name" | null;
  /** After name is saved, continue to doctor list or other step. */
  resume_after_name?: "specialty" | "doctors" | null;
  pending_kind?: "slots" | "doctors" | "clinics" | "specialties" | "main_menu" | null;
  pending_slots?: PendingSlotOffer[];
  pending_doctors?: PendingDoctorPick[];
  pending_clinics?: PendingClinicPick[];
  pending_specialties?: PendingSpecialtyPick[];
  last_specialty?: string | null;
  last_specialty_id?: number | null;
  hub_clinic_id?: number;
  /** Increments when list parsing fails in an interactive step; threshold triggers human handoff. */
  consecutive_unparsed?: number;
  time_pref?: DialogueTimePref | null;
  /** Slot list pagination for "مواعيد أخرى" in slot_offer. */
  slot_page?: number;
  pending_cancel_appointment_id?: number | null;
  updated_at?: string;
};

export function defaultDialogueState(): StoredDialogueState {
  return {
    flow_step: "idle",
    pending_kind: null,
  };
}
