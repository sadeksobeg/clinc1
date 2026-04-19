/**
 * Stored in `conversations.dialogue_state` (JSONB) — booking FSM for WhatsApp.
 * `flow_step` drives the next expected patient message.
 */
export type FlowStep =
  | "idle"
  | "choose_clinic"
  | "choose_doctor"
  | "slot_offer"
  | "awaiting_confirm"
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

/** Persisted preference from the patient’s booking wording (see `timePreference.ts`). */
export type DialogueTimePref = "morning" | "afternoon" | "any";

export type StoredDialogueState = {
  flow_step: FlowStep;
  pending_kind?: "slots" | "doctors" | "clinics" | null;
  pending_slots?: PendingSlotOffer[];
  pending_doctors?: PendingDoctorPick[];
  pending_clinics?: PendingClinicPick[];
  last_specialty?: string | null;
  hub_clinic_id?: number;
  /** Increments when list parsing fails in an interactive step; threshold triggers human handoff. */
  consecutive_unparsed?: number;
  time_pref?: DialogueTimePref | null;
  updated_at?: string;
};

export function defaultDialogueState(): StoredDialogueState {
  return {
    flow_step: "idle",
    pending_kind: null,
  };
}
