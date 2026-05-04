export type ConversationMessage = {
  id: number;
  direction: "inbound" | "outbound" | string;
  text: string;
  created_at: string;
  intent?: string | null;
  is_urgent?: boolean | null;
};

export type DecisionLayerSnapshot = {
  type?: string;
  actions?: string[];
  reason?: string;
  priority?: number;
  severity?: number;
  confidence?: number;
  risk_score?: number;
  primary_medical_reason?: string | null;
  medical_signals?: {
    breathing_issue?: boolean;
    bleeding?: boolean;
    severe_pain?: boolean;
    loss_of_consciousness?: boolean;
    trauma?: boolean;
    infection_signs?: boolean;
    mobility_issue?: boolean;
    psychological_distress?: boolean;
  } | null;
  patient_context?: {
    known_patient?: boolean;
    is_child?: boolean;
    is_elderly?: boolean;
    chronic_condition?: boolean;
  } | null;
  interpret_intent?: string;
  suggested_actions_count?: number;
  ts?: string;
  inbound_message_id?: number;
  engine_version?: string;
};

export type SuggestedDecisionAction = {
  id: string;
  type: "CREATE_APPOINTMENT" | string;
  status?: "pending" | "executed" | "rejected" | string;
  reason?: string;
  created_at?: string;
  payload?: {
    suggested_time?: string;
    doctor_id?: number;
    doctor_name?: string;
    source_channel?: string;
    [k: string]: unknown;
  };
};

export type DecisionExecutionSnapshot = {
  action_id?: string;
  action_type?: string;
  decision?: "confirm" | "reject" | string;
  status?: string;
  reason?: string[];
  appointment_id?: number;
  duplicate_booking?: boolean;
  bridge_send_ok?: boolean;
  bridge_send_error?: string | null;
  queued_outbox_id?: number | null;
  ts?: string;
};

export type EmergencyEventSnapshot = {
  source?: string;
  status?: "allocated" | "handoff" | string;
  outcome?: string;
  reason?: string;
  starts_at?: string;
  doctor_id?: number;
  appointment_id?: number;
  allow_next_day_override?: boolean;
  bumped_count?: number;
  bumped_notified?: number;
  ts?: string;
};

export type DecisionFeedbackSnapshot = {
  is_correct?: boolean;
  corrected_decision?: "EMERGENCY" | "BOOKING" | "NORMAL" | "UNKNOWN" | string | null;
  corrected_severity?: number | null;
  corrected_medical_signals?: {
    breathing_issue?: boolean;
    bleeding?: boolean;
    severe_pain?: boolean;
    loss_of_consciousness?: boolean;
    trauma?: boolean;
    infection_signs?: boolean;
    mobility_issue?: boolean;
    psychological_distress?: boolean;
  } | null;
  corrected_primary_signal?: string | null;
  corrected_patient_context?: {
    is_child?: boolean;
    is_elderly?: boolean;
    chronic_condition?: boolean;
  } | null;
  mismatch_detected?: boolean;
  note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

export type ConversationDetail = {
  id?: number;
  patient_id?: number | null;
  display_name?: string | null;
  chat_id?: string | null;
  /** رقم الهاتف المخزّن في CRM (يفضّل عرضه بدل chat_id عند توفره) */
  phone_e164?: string | null;
  state?: string | null;
  status?: string | null;
  summary?: string | null;
  routing?: {
    unread?: boolean;
    archived?: boolean;
    assigned_doctor_id?: number;
    decision_priority?: string;
    last_decision?: DecisionLayerSnapshot;
    suggested_actions?: SuggestedDecisionAction[];
    last_decision_execution?: DecisionExecutionSnapshot;
    last_emergency_event?: EmergencyEventSnapshot;
    decision_feedback?: DecisionFeedbackSnapshot;
    [k: string]: unknown;
  };
};

export type ProductMetrics = {
  product?: Record<string, number | string | boolean | null>;
  whatsapp_policy?: Record<string, number | string | boolean | null>;
};
