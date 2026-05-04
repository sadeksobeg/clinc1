export type SlotOffer = {
  starts_at: string;
  ends_at: string;
  doctor_id: number;
  doctor_name: string;
};

export type InterpretResult = {
  intent:
    | "booking"
    | "cancel"
    | "reschedule"
    | "urgent"
    | "question"
    | "unknown"
    | "emergency"
    | "followup"
    | "info"
    | "complaint";
  /** Clinical routing slug, e.g. dental, pediatrics, general */
  specialty: string | null;
  doctor_hint: string | null;
  /** Model or heuristic clinic name hint for multi-clinic routing */
  clinic_hint: string | null;
  /** Patient display name if stated in message (brain extract); optional */
  patient_name: string | null;
  urgency: "low" | "normal" | "medium" | "high" | "critical";
  emergency: {
    detected: boolean;
    severity: 1 | 2 | 3 | 4 | 5;
    reason?: string;
  };
  medical_signals?: {
    breathing_issue?: boolean;
    bleeding?: boolean;
    severe_pain?: boolean;
    loss_of_consciousness?: boolean;
    trauma?: boolean;
    infection_signs?: boolean;
    mobility_issue?: boolean;
    psychological_distress?: boolean;
  };
  patient_context: {
    known_patient: boolean;
    name?: string;
    is_child?: boolean;
    is_elderly?: boolean;
    chronic_condition?: boolean;
  };
  booking_intent?: {
    requested_time?: string;
    flexible: boolean;
  };
  reply_hint?: string | null;
  confidence: number;
  source: "ollama" | "heuristic";
  /** When true, prefer staff review before automated booking actions */
  needs_human: boolean;
  /** Short Arabic summary for CRM / handoff; null if none */
  summary: string | null;
  /** Decision-layer urgency level used for emergency overrides. */
  urgency_level?: "normal" | "priority" | "emergency";
  /** Suggested next action from AI brain (informational, backend may override). */
  action?: string | null;
  /** Slot requirements for downstream scheduling action. */
  required_slots?: number | null;
  /** Optional machine event that must be treated as a system action, not user intent. */
  system_event?: {
    type: "system_event";
    event: string;
    context?: Record<string, unknown> | null;
  } | null;
};
