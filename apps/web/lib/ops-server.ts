import "server-only";

function opsBaseUrl(): string {
  const u = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "");
  if (!u) throw new Error("OPS_DASHBOARD_URL is not set");
  return u;
}

function serviceHeaders(): HeadersInit {
  const token = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!token) throw new Error("SCHEDULING_SERVICE_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function requireClinicId(clinicId?: number): number {
  const cid = Number(clinicId ?? 0);
  if (!Number.isFinite(cid) || cid <= 0) {
    throw new Error("clinic_id is required");
  }
  return cid;
}

export type InboxRow = {
  conversation_id: number;
  /** conversations.clinic_id (Hub owner). */
  owner_clinic_id?: number;
  routed_clinic_id?: number | null;
  state: string;
  handoff_reason?: string | null;
  status: string;
  routing?: Record<string, unknown>;
  unread?: boolean;
  patient_id: number;
  chat_id: string;
  display_name: string | null;
  is_vip: boolean;
  is_blacklisted: boolean;
  last_message: string | null;
  last_message_at: string | null;
  /** Last inbound message intent (avoids outbound replies carrying urgency). */
  last_inbound_intent?: string | null;
  last_inbound_is_urgent?: boolean;
  last_inbound_severity?: number | null;
  last_inbound_confidence?: number | null;
  last_decision_type?: string | null;
  last_decision_reason?: string | null;
  last_decision_primary_medical_reason?: string | null;
};

export async function fetchInboxRows(clinicId?: number): Promise<{ ok: boolean; rows?: InboxRow[]; error?: string }> {
  const cid = requireClinicId(clinicId);
  const res = await fetch(`${opsBaseUrl()}/api/internal/inbox?clinic_id=${cid}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json()) as { ok?: boolean; rows?: InboxRow[]; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, rows: data.rows || [] };
}

export type FetchConversationDetailResult =
  | { ok: true; conversation?: unknown; messages?: unknown[]; status?: number }
  | { ok: false; error: string; status?: number };

export async function fetchConversationDetail(
  conversationId: number,
  clinicId?: number,
): Promise<FetchConversationDetailResult> {
  const cid = requireClinicId(clinicId);
  const res = await fetch(
    `${opsBaseUrl()}/api/internal/conversations/${conversationId}?clinic_id=${cid}`,
    { headers: serviceHeaders(), cache: "no-store" },
  );
  const data = (await res.json()) as {
    ok?: boolean;
    conversation?: unknown;
    messages?: unknown[];
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error || res.statusText, status: res.status };
  }
  return { ok: true, conversation: data.conversation, messages: data.messages, status: res.status };
}

export async function proxyProcessInbound(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${opsBaseUrl()}/api/internal/conversations/process-inbound`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export type PatientRow = {
  id: number;
  chat_id: string;
  display_name: string | null;
  phone_e164: string | null;
  status: string;
  birth_date?: string | null;
  gender?: string | null;
  city?: string | null;
  is_vip: boolean;
  is_blacklisted: boolean;
  first_seen_at: string;
  last_seen_at: string;
};

export async function fetchPatientsRows(clinicId?: number): Promise<{ ok: boolean; rows?: PatientRow[]; error?: string }> {
  const cid = requireClinicId(clinicId);
  const res = await fetch(`${opsBaseUrl()}/api/internal/patients?clinic_id=${cid}&limit=500`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json()) as { ok?: boolean; rows?: PatientRow[]; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, rows: data.rows || [] };
}

export async function fetchPatientDetail(
  patientId: number,
  clinicId?: number,
): Promise<{ ok: boolean; patient?: PatientDetail; appointments?: PatientAppointmentSummary[]; error?: string }> {
  const cid = requireClinicId(clinicId);
  const res = await fetch(`${opsBaseUrl()}/api/internal/patients/${patientId}?clinic_id=${cid}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json()) as {
    ok?: boolean;
    patient?: PatientDetail;
    appointments?: PatientAppointmentSummary[];
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  if (!data.ok || !data.patient) return { ok: false, error: data.error || "not_found" };
  return { ok: true, patient: data.patient, appointments: data.appointments ?? [] };
}

export type AppointmentRow = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  patient_arrival_state?: string | null;
  patient_id: number | null;
  doctor_id: number | null;
  patient_display_name: string | null;
  doctor_name: string | null;
  notes?: string | null;
  source_channel?: string | null;
};

export type PatientAppointmentSummary = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  source_channel: string | null;
  doctor_id: number | null;
  notes: string | null;
};

export type PatientDetail = {
  id: number;
  chat_id: string;
  wa_phone_digits?: string | null;
  last_conversation_id?: number | null;
  display_name: string | null;
  phone_e164: string | null;
  status: string;
  birth_date?: string | null;
  gender?: string | null;
  city?: string | null;
  is_vip: boolean;
  is_blacklisted: boolean;
  notes: string | null;
  insurance_note: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export type DoctorRow = {
  id: number;
  display_name: string;
  specialty: string | null;
  slot_duration_minutes: number;
  is_active: boolean;
};

export async function fetchUpcomingAppointments(
  clinicId?: number,
  days?: number,
): Promise<{ ok: boolean; rows?: AppointmentRow[]; error?: string }> {
  const cid = requireClinicId(clinicId);
  const d = days ?? 14;
  const res = await fetch(`${opsBaseUrl()}/api/internal/appointments/upcoming?clinic_id=${cid}&days=${d}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json()) as { ok?: boolean; rows?: AppointmentRow[]; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, rows: data.rows || [] };
}

export async function fetchDoctorsRows(clinicId?: number): Promise<{ ok: boolean; rows?: DoctorRow[]; error?: string }> {
  const cid = requireClinicId(clinicId);
  const res = await fetch(`${opsBaseUrl()}/api/internal/doctors?clinic_id=${cid}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json()) as { ok?: boolean; rows?: DoctorRow[]; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, rows: data.rows || [] };
}

export async function fetchDoctorSlots(args: {
  clinic_id: number;
  doctor_id?: number;
  specialty?: string;
  conversation_id?: number;
  limit?: number;
  /** yyyy-MM-dd في تقويم العيادة */
  day_key?: string;
}): Promise<{ ok: boolean; slots?: unknown[]; reply_lines?: string[]; closed_message_ar?: string; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/scheduling/slots`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    slots?: unknown[];
    reply_lines?: string[];
    closed_message_ar?: string;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, slots: data.slots || [], reply_lines: data.reply_lines, closed_message_ar: data.closed_message_ar };
}

export async function createAppointment(args: {
  clinic_id: number;
  patient_id: number;
  doctor_id: number;
  starts_at: string;
  conversation_id?: number;
  idempotency_key?: string;
}): Promise<{ ok: boolean; appointment_id?: number; duplicate?: boolean; error?: string; code?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/scheduling/confirm`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    appointment_id?: number;
    duplicate?: boolean;
    error?: string;
    code?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText, code: data.code };
  return { ok: true, appointment_id: data.appointment_id, duplicate: data.duplicate };
}

export async function fetchProductMetrics(): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/metrics/product`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: (data as { error?: string }).error || res.statusText };
  return { ok: true, data };
}

export async function proxyConversationReply(
  conversationId: number,
  body: { clinic_id: number; text: string; template_key?: string; idempotency_key?: string },
): Promise<Response> {
  return fetch(`${opsBaseUrl()}/api/internal/conversations/${conversationId}/reply`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export async function proxyAppointmentPatch(
  appointmentId: number,
  body: {
    clinic_id: number;
    starts_at?: string;
    ends_at?: string;
    status?: "pending" | "confirmed" | "cancelled" | "no_show" | "completed";
    patient_arrival_state?: "expected" | "late" | "checked_in" | "no_show";
    idempotency_key?: string;
  },
): Promise<Response> {
  return fetch(`${opsBaseUrl()}/api/internal/scheduling/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export async function patchConversation(args: {
  conversation_id: number;
  clinic_id: number;
  mark_unread?: boolean;
  assign_doctor_id?: number;
  archive?: boolean;
  state?: string;
  idempotency_key?: string;
}): Promise<{ ok: boolean; conversation?: unknown; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/conversations/${args.conversation_id}`, {
    method: "PATCH",
    headers: serviceHeaders(),
    body: JSON.stringify({
      clinic_id: args.clinic_id,
      mark_unread: args.mark_unread,
      assign_doctor_id: args.assign_doctor_id,
      archive: args.archive,
      state: args.state,
      idempotency_key: args.idempotency_key,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; conversation?: unknown; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, conversation: data.conversation };
}

export async function suggestAiReply(args: {
  text: string;
  conversation_id?: number;
}): Promise<{ ok: boolean; interpret?: unknown; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/scheduling/interpret`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; interpret?: unknown; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, interpret: data.interpret };
}

export type DecisionExecuteArgs = {
  clinic_id: number;
  conversation_id: number;
  action_id: string;
  decision: "confirm" | "reject";
};

export async function executeDecisionAction(args: DecisionExecuteArgs): Promise<{
  ok: boolean;
  status?: string;
  reason?: string[];
  action_id?: string;
  appointment_id?: number;
  duplicate?: boolean;
  bridge_send_ok?: boolean;
  bridge_send_error?: string | null;
  queued_outbox_id?: number | null;
  error?: string;
  code?: string;
}> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/decision/execute`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    status?: string;
    reason?: string[];
    action_id?: string;
    appointment_id?: number;
    duplicate?: boolean;
    bridge_send_ok?: boolean;
    bridge_send_error?: string | null;
    queued_outbox_id?: number | null;
    error?: string;
    code?: string;
  };
  if (!res.ok) return { ok: false, status: data.status, reason: data.reason, error: data.error || res.statusText, code: data.code };
  return {
    ok: true,
    status: data.status,
    reason: data.reason,
    action_id: data.action_id,
    appointment_id: data.appointment_id,
    duplicate: data.duplicate,
    bridge_send_ok: data.bridge_send_ok,
    bridge_send_error: data.bridge_send_error,
    queued_outbox_id: data.queued_outbox_id,
  };
}

export async function regenerateDecisionSuggestion(args: {
  clinic_id: number;
  conversation_id: number;
}): Promise<{
  ok: boolean;
  action?: unknown;
  error?: string;
  code?: string;
}> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/decision/regenerate`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; action?: unknown; error?: string; code?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText, code: data.code };
  return { ok: true, action: data.action };
}

export type DecisionFeedbackArgs = {
  clinic_id: number;
  conversation_id: number;
  is_correct: boolean;
  corrected_decision?: "EMERGENCY" | "BOOKING" | "NORMAL" | "UNKNOWN";
  corrected_severity?: number;
  corrected_medical_signals?: {
    breathing_issue?: boolean;
    bleeding?: boolean;
    severe_pain?: boolean;
    loss_of_consciousness?: boolean;
    trauma?: boolean;
    infection_signs?: boolean;
    mobility_issue?: boolean;
    psychological_distress?: boolean;
  };
  corrected_primary_signal?:
    | "breathing_issue"
    | "bleeding"
    | "severe_pain"
    | "loss_of_consciousness"
    | "trauma"
    | "infection_signs"
    | "mobility_issue"
    | "psychological_distress";
  corrected_patient_context?: {
    is_child?: boolean;
    is_elderly?: boolean;
    chronic_condition?: boolean;
  };
  note?: string;
  reviewed_by?: string;
};

export async function submitDecisionFeedback(args: DecisionFeedbackArgs): Promise<{
  ok: boolean;
  feedback?: Record<string, unknown>;
  error?: string;
}> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/decision/feedback`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    feedback?: Record<string, unknown>;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, feedback: data.feedback };
}

export async function fetchActionAudit(args: { clinic_id?: number; limit?: number }): Promise<{
  ok: boolean;
  summary?: unknown[];
  logs?: unknown[];
  error?: string;
}> {
  const clinicId = requireClinicId(args.clinic_id);
  const limit = args.limit ?? 50;
  const res = await fetch(`${opsBaseUrl()}/api/internal/audit/actions?clinic_id=${clinicId}&limit=${limit}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    summary?: unknown[];
    logs?: unknown[];
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, summary: data.summary || [], logs: data.logs || [] };
}

export async function fetchClinicSettings(
  clinicId: number,
): Promise<{ ok: boolean; clinic?: unknown; working_hours?: unknown[]; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/clinics/${clinicId}/settings`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    clinic?: unknown;
    working_hours?: unknown[];
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, clinic: data.clinic, working_hours: data.working_hours || [] };
}

export async function fetchSystemDeepHealth(): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const token = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!token) return { ok: false, error: "missing_service_token" };
  const res = await fetch(`${opsBaseUrl()}/api/system/health/deep`, {
    headers: {
      ...serviceHeaders(),
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: (data as { error?: string }).error || res.statusText };
  return { ok: true, data };
}

export async function patchClinicSettings(
  clinicId: number,
  body: { name?: string; timezone?: string; metadata?: Record<string, unknown>; holidays?: string[]; working_hours?: unknown[] },
): Promise<{ ok: boolean; clinic?: unknown; working_hours?: unknown[]; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/clinics/${clinicId}/settings`, {
    method: "PATCH",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    clinic?: unknown;
    working_hours?: unknown[];
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, clinic: data.clinic, working_hours: data.working_hours || [] };
}

export async function runAiCalibrationAction(args: {
  clinic_id: number;
  action: "suggest" | "apply" | "reject";
  actor_user_id?: string;
}): Promise<{ ok: boolean; ai_calibration?: Record<string, unknown>; warning?: string; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/ai/calibration`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    ai_calibration?: Record<string, unknown>;
    warning?: string;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, ai_calibration: data.ai_calibration, warning: data.warning };
}

export async function runAiCalibrationRollback(args: {
  clinic_id: number;
  actor_user_id?: string;
}): Promise<{ ok: boolean; ai_calibration?: Record<string, unknown>; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/ai/calibration/rollback`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    ai_calibration?: Record<string, unknown>;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, ai_calibration: data.ai_calibration };
}

export async function fetchSystemKpis(): Promise<{
  ok: boolean;
  kpis?: {
    emergency_rate_24h: number;
    uncertain_rate_24h: number;
    auto_book_success_rate_24h: number;
    feedback_correction_rate_24h: number;
  };
  error?: string;
}> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/system/kpi`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    kpis?: {
      emergency_rate_24h: number;
      uncertain_rate_24h: number;
      auto_book_success_rate_24h: number;
      feedback_correction_rate_24h: number;
    };
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, kpis: data.kpis };
}

export async function fetchLocalBillingSnapshot(clinicId: number): Promise<{
  ok: boolean;
  clinic?: unknown;
  snapshot?: unknown;
  payment_requests?: unknown[];
  error?: string;
}> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/billing/clinics/${clinicId}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    clinic?: unknown;
    snapshot?: unknown;
    payment_requests?: unknown[];
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, clinic: data.clinic, snapshot: data.snapshot, payment_requests: data.payment_requests || [] };
}

export async function createLocalPaymentRequest(
  clinicId: number,
  body: {
    payment_method: "cash" | "shamcash" | "manual_transfer";
    amount_usd: number;
    receipt_url?: string;
    reference_code?: string;
    note?: string;
    requested_by?: string;
    request_type?: "activation" | "renewal";
    idempotency_key?: string;
  },
): Promise<{ ok: boolean; request?: unknown; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/billing/clinics/${clinicId}`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; request?: unknown; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, request: data.request };
}

export async function fetchBillingAdminRequests(args?: { status?: string; limit?: number }): Promise<{
  ok: boolean;
  rows?: unknown[];
  error?: string;
}> {
  const status = args?.status ?? "pending";
  const limit = args?.limit ?? 100;
  const res = await fetch(`${opsBaseUrl()}/api/internal/billing/admin/requests?status=${encodeURIComponent(status)}&limit=${limit}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: unknown[]; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, rows: data.rows || [] };
}

export async function reviewBillingRequest(
  requestId: number,
  body: {
    decision: "approve" | "reject";
    reviewer?: string;
    review_note?: string;
    idempotency_key?: string;
    billing_confirm?: boolean;
    billing_confirm_phrase?: string;
  },
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/billing/admin/requests/${requestId}/review`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string; detail?: string };
  if (!res.ok) return { ok: false, error: data.error || data.detail || res.statusText };
  return { ok: true, status: data.status };
}

export async function fetchClinicBillingInvoices(clinicId: number): Promise<{
  ok: boolean;
  rows?: unknown[];
  error?: string;
}> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/billing/clinics/${clinicId}/invoices`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: unknown[]; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, rows: data.rows || [] };
}

export async function fetchBillingAdminInvoices(args?: { status?: string; limit?: number }): Promise<{
  ok: boolean;
  rows?: unknown[];
  error?: string;
}> {
  const status = args?.status ?? "all";
  const limit = args?.limit ?? 200;
  const res = await fetch(`${opsBaseUrl()}/api/internal/billing/admin/invoices?status=${encodeURIComponent(status)}&limit=${limit}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: unknown[]; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, rows: data.rows || [] };
}

export async function fetchBillingRevenue(): Promise<{
  ok: boolean;
  summary?: unknown;
  clinics?: unknown[];
  reminder_runs?: unknown[];
  error?: string;
}> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/billing/admin/revenue`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    summary?: unknown;
    clinics?: unknown[];
    reminder_runs?: unknown[];
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, summary: data.summary, clinics: data.clinics || [], reminder_runs: data.reminder_runs || [] };
}

export async function runBillingReminders(args?: { trigger_source?: string }): Promise<{
  ok: boolean;
  run_id?: number;
  sent?: number;
  failed?: number;
  skipped?: number;
  error?: string;
}> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/billing/reminders/run`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({ trigger_source: args?.trigger_source ?? "manual" }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    run_id?: number;
    sent?: number;
    failed?: number;
    skipped?: number;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, run_id: data.run_id, sent: data.sent ?? 0, failed: data.failed ?? 0, skipped: data.skipped ?? 0 };
}

export async function fetchBillingReminderRuns(): Promise<{
  ok: boolean;
  runs?: Array<{
    id: number;
    trigger_source: string;
    status: string;
    sent_count: number;
    failed_count: number;
    skipped_count: number;
    error_text: string | null;
    started_at: string;
    ended_at: string | null;
  }>;
  error?: string;
}> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/billing/reminders/runs`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    runs?: Array<{
      id: number;
      trigger_source: string;
      status: string;
      sent_count: number;
      failed_count: number;
      skipped_count: number;
      error_text: string | null;
      started_at: string;
      ended_at: string | null;
    }>;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, runs: data.runs || [] };
}

export async function createTrialSignup(args: {
  clinicName: string;
  ownerName: string;
  whatsapp: string;
  city: string;
  specialty: string;
  doctorsCount: number;
  email: string;
  password: string;
  trialDays?: number;
  browserFingerprint?: string;
  domain?: string;
  vat?: string;
}): Promise<{
  ok: boolean;
  status?: number;
  trial?: {
    clinic_id: number;
    clinic_slug: string;
    trial_ends_at: string;
    admin_user_id: number;
    doctors_limit: number;
    direct_access_url: string;
  };
  warnings?: Record<string, unknown>;
  error?: string;
}> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/trial/signup`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    trial?: {
      clinic_id: number;
      clinic_slug: string;
      trial_ends_at: string;
      admin_user_id: number;
      doctors_limit: number;
      direct_access_url: string;
    };
    warnings?: Record<string, unknown>;
    error?: string;
  };
  if (!res.ok) return { ok: false, status: res.status, error: data.error || res.statusText };
  return { ok: true, trial: data.trial, warnings: data.warnings };
}

export async function publishTrialFunnelEvent(event: {
  event:
    | "trial_started"
    | "trial_step_viewed"
    | "trial_step_completed"
    | "trial_validation_failed"
    | "trial_submitted"
    | "trial_submit_failed"
    | "trial_submit_success"
    | "trial_rage_click"
    | "trial_paid_conversion";
  trial_session_id: string;
  clinic_id?: number;
  step?: number;
  fields?: string[];
  count?: number;
  step_duration_ms?: number;
  reason?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
  landing_path?: string;
  experiment_id?: string;
  variant_id?: string;
  cohort_key?: string;
  ts: string;
  ts_ms: number;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/analytics/trial/event`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(event),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true };
}

export async function fetchTrialFunnelEventsSince(args: {
  sinceMs: number;
  untilMs?: number;
  cohort_key?: string;
  experiment_id?: string;
  variant_id?: string;
  utm_source?: string;
}): Promise<{
  ok: boolean;
  events?: Array<{
    event:
      | "trial_started"
      | "trial_step_viewed"
      | "trial_step_completed"
      | "trial_validation_failed"
      | "trial_submitted"
      | "trial_submit_failed"
      | "trial_submit_success"
      | "trial_rage_click"
      | "trial_paid_conversion";
    trial_session_id: string;
    clinic_id?: number;
    step?: number;
    fields?: string[];
    count?: number;
    step_duration_ms?: number;
    reason?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    referrer?: string;
    landing_path?: string;
    experiment_id?: string;
    variant_id?: string;
    cohort_key?: string;
    ts: string;
    ts_ms: number;
  }>;
  error?: string;
}> {
  const q = new URLSearchParams({
    since_ms: String(args.sinceMs),
  });
  if (args.untilMs) q.set("until_ms", String(args.untilMs));
  if (args.cohort_key) q.set("cohort_key", args.cohort_key);
  if (args.experiment_id) q.set("experiment_id", args.experiment_id);
  if (args.variant_id) q.set("variant_id", args.variant_id);
  if (args.utm_source) q.set("utm_source", args.utm_source);
  const res = await fetch(`${opsBaseUrl()}/api/internal/analytics/trial/events?${q.toString()}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; events?: unknown[]; error?: string };
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, events: (data.events || []) as Array<any> };
}
