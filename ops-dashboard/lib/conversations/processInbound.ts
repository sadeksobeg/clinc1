import type { Pool, PoolClient } from "pg";
import { DateTime } from "luxon";
import { crmUpsertInbound, type InboundIngestInput, type InboundIngestRow } from "@/lib/crm/inboundIngest";
import { publishInboundMessageRecorded } from "@/lib/events/redisPublish";
import { computeInboundEventId } from "@/lib/events/computeInboundEventId";
import { inboundMessageRecordedSchema } from "@/lib/events/inboundMessageRecorded";
import { getDefaultMessagingAdapter } from "@/lib/messaging/WhatsAppWebAdapter";
import { appendDomainEvent } from "@/lib/domain/domainEvents";
import { maybeEnqueueDomainEventAppend } from "@/lib/db/domainEventWriteBuffer";
import { maybeEnqueueOutboundMessageRow } from "@/lib/db/outboundMessageWriteBuffer";
import { maybePrefetchClinicScheduleAfterRoutingLock } from "@/lib/messaging/clinicSchedulePrefetch";
import { incProductMetric } from "@/lib/observability/productMetrics";
import { enqueueCoreOutbox } from "@/lib/outbox/coreOutbox";
import { sendPatientWhatsAppGuarded } from "@/lib/whatsapp/patientOutbound";
import { interpretInboundHeuristic, interpretInboundText } from "@/lib/scheduling/interpret";
import {
  aiAnalysisToInterpretResult,
  buildAIAnalysisInput,
  getAIAdapter,
  getAIConfidenceThreshold,
  setConversationHandoffPending,
} from "@/lib/ai/AIModelAdapter";
import { normalizeInboundRules, resolveInboundRouteContext, type NormalizedInboundRules } from "./normalizeInbound";
import { parseDialogueState } from "./dialogueParse";
import { startBookingDialogueFlow, tryConsumeBookingDialogueTurn, type ConsumedBookingTurn } from "./bookingDialogueFlow";
import { tryConsumeMainMenuTurn, offerMainMenuTurn, shouldOfferMainMenu } from "./mainMenuFlow";
import { tryHybridBrainRoute } from "./hybridBrainRouter";
import { runSchedulingDecision, type SchedulingDecision } from "./schedulingDecision";
import { formatDateTimeAr } from "./whatsappTime";
import { canClinicAutoReply } from "@/lib/billing/localBilling";
import { acquireInboundPatientLock } from "@/lib/messaging/inboundPatientLock";
import {
  pushDeferredInboundJob,
  createPostIngestJobV2,
  enqueuePostIngestDeferredV2Job,
} from "@/lib/messaging/inboundDeferredQueue";
import { acquireConversationInboundLock } from "@/lib/messaging/conversationInboundLock";
import {
  type PostIngestJobV2,
  inferPostIngestLane,
  queuePriorityFromNorm,
  queuePriorityWithSla,
} from "@/lib/messaging/inboundDeferredJobV2";
import {
  getConvContextFromCache,
  invalidateConvContextCache,
  setConvContextCache,
} from "@/lib/messaging/conversationContextCache";
import { tryAcquireAiBudgetSlot } from "@/lib/messaging/interpretAiBudget";
import { applyIntentOverlayIfApplicable } from "@/lib/messaging/microBatchIntentOverlay";
import { runEmergencyDecisionEngine } from "@/lib/scheduling/emergencyDecisionEngine";
import { decideAction, type Decision } from "@/lib/ai/decisionEngine";
import { executeDecision, isDecisionEngineEnabled } from "@/lib/ai/actionExecutor";
import { getCurrentCalibrationThresholds } from "@/lib/ai/calibrationEngine";
import {
  resolveEmergencySendPolicy,
  templateRequiredMessageAr,
} from "@/lib/messaging/whatsapp24hPolicy";
import {
  fetchPatientConversationMemory,
  upsertPatientConversationMemory,
} from "@/lib/conversations/patientConversationMemory";
import { getRuntimeFlag } from "@/lib/system/emergencyMode";

/** Patient-visible message when clinic subscription blocks auto-reply. */
const BILLING_LOCKED_REPLY_AR =
  "انتهت الفترة التجريبية أو اشتراك العيادة غير فعّال. للاشتراك أو التجديد يرجى التواصل مع إدارة العيادة عبر واتساب.";

export type ProcessInboundContext = {
  correlationId?: string;
  /** From whatsapp_inbound_routes.allowed_clinic_ids — visible to the booking FSM
   * via `routing.allowed_clinic_ids` (ephemeral, not persisted). */
  routeAllowedClinicIds?: number[];
};

export type ProcessInboundInput = {
  clinic_id?: unknown;
  from?: unknown;
  sender?: unknown;
  text?: unknown;
  messageId?: unknown;
  receivedAt?: unknown;
  execute_send?: boolean;
  send_urgent_alert?: boolean;
  enqueue_on_bridge_failure?: boolean;
};

export type ProcessInboundResult = {
  ok: boolean;
  duplicate?: boolean;
  error?: string;
  clinic_id?: number;
  patient_id?: number;
  conversation_id?: number;
  inbound_message_id?: number;
  dedupeHash?: string;
  finalIntent?: string;
  finalPriority?: number;
  reply_text?: string;
  decision_source?: string;
  handoff_required?: boolean;
  bridge_send_ok?: boolean;
  bridge_send_error?: string | null;
  urgent_alert_sent?: boolean;
  urgent_alert_error?: string | null;
  outbox_ids?: number[];
  case_id?: number | null;
  alert_id?: number | null;
  workflow_latency_ms?: number;
  dialogue_version?: number;
  billing_locked?: boolean;
  queued?: boolean;
  defer_reason?: "lock_contended" | "conversation_lock_contended";
};

function casePriorityFrom(finalPriority: number): string {
  if (finalPriority === 1) return "high";
  if (finalPriority <= 3) return "normal";
  return "low";
}

function needsHandoff(dec: SchedulingDecision): boolean {
  return Boolean(dec.handoffRequired || dec.finalIntent === "URGENT" || Number(dec.finalPriority) === 1);
}

function parseSystemEvent(text: string): { type: "system_event"; event: string; context?: Record<string, unknown> | null } | null {
  try {
    const obj = JSON.parse(text) as { type?: unknown; event?: unknown; context?: unknown };
    if (obj?.type !== "system_event") return null;
    if (typeof obj.event !== "string" || !obj.event.trim()) return null;
    const context =
      obj.context && typeof obj.context === "object" && !Array.isArray(obj.context)
        ? (obj.context as Record<string, unknown>)
        : null;
    return { type: "system_event", event: obj.event.trim(), context };
  } catch {
    return null;
  }
}

function deriveEmergencyMedicalBoost(
  int: Awaited<ReturnType<typeof interpretInboundText>>,
  breathingBoost: number,
): number {
  const s = int.medical_signals ?? {};
  if (s.loss_of_consciousness) return 3;
  if (s.breathing_issue) return breathingBoost;
  if (s.bleeding) return 1.5;
  if (s.severe_pain || s.trauma) return 1;
  return 0;
}

function isManualOverrideActive(routing: Record<string, unknown>): boolean {
  const at = routing.manual_override_at;
  if (typeof at !== "string") return false;
  const ts = Date.parse(at);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= 24 * 60 * 60 * 1000;
}

function emergencyThrottleUntilMs(meta: Record<string, unknown>): number | null {
  const aiCalibration = (meta.ai_calibration ?? {}) as Record<string, unknown>;
  const until = aiCalibration.emergency_throttle_until;
  if (typeof until !== "string") return null;
  const ts = Date.parse(until);
  if (!Number.isFinite(ts)) return null;
  return ts;
}

async function maybeActivateEmergencyThrottle(
  pool: Pool,
  clinicId: number,
  clinicMetadata: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const currentUntil = emergencyThrottleUntilMs(clinicMetadata);
  if (currentUntil != null && currentUntil > Date.now()) return clinicMetadata;

  const r = await pool.query(
    `SELECT routing->'last_decision' AS last_decision,
            routing->'decision_feedback' AS decision_feedback
     FROM conversations
     WHERE clinic_id = $1
       AND deleted_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 400`,
    [clinicId],
  );
  const sinceMs = Date.now() - 15 * 60 * 1000;
  let emergencyCount = 0;
  let positiveFeedbackCount = 0;
  for (const row of r.rows) {
    const d = (row.last_decision ?? {}) as Record<string, unknown>;
    const f = (row.decision_feedback ?? {}) as Record<string, unknown>;
    const dTs = Date.parse(String(d.ts ?? ""));
    if (d.type === "EMERGENCY" && Number.isFinite(dTs) && dTs >= sinceMs) {
      emergencyCount += 1;
    }
    const fTs = Date.parse(String(f.reviewed_at ?? ""));
    if (f.is_correct === true && Number.isFinite(fTs) && fTs >= sinceMs) {
      positiveFeedbackCount += 1;
    }
  }
  if (emergencyCount < 8 || positiveFeedbackCount > 1) return clinicMetadata;

  const aiCalibration = (clinicMetadata.ai_calibration ?? {}) as Record<string, unknown>;
  const next = {
    ...aiCalibration,
    emergency_throttle_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    emergency_throttle_reason: "spike_without_positive_feedback",
    last_updated: new Date().toISOString(),
  };
  await pool.query(
    `UPDATE clinics
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify({ ai_calibration: next }), clinicId],
  );
  incProductMetric("emergency_throttle_activated_total");
  return { ...clinicMetadata, ai_calibration: next };
}

async function maybeAutoRollbackWatchWindow(
  pool: Pool,
  clinicId: number,
  clinicMetadata: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const aiCalibration = (clinicMetadata.ai_calibration ?? {}) as Record<string, unknown>;
  const watchUntilRaw = aiCalibration.watch_until;
  if (typeof watchUntilRaw !== "string") return clinicMetadata;
  const watchUntilMs = Date.parse(watchUntilRaw);
  if (!Number.isFinite(watchUntilMs) || Date.now() > watchUntilMs) return clinicMetadata;

  const feedbackR = await pool.query(
    `SELECT routing->'decision_feedback' AS decision_feedback
     FROM conversations
     WHERE clinic_id = $1
       AND deleted_at IS NULL
       AND routing ? 'decision_feedback'
     ORDER BY updated_at DESC
     LIMIT 500`,
    [clinicId],
  );
  const sinceMs = Date.now() - 4 * 60 * 60 * 1000;
  let total = 0;
  let negative = 0;
  for (const row of feedbackR.rows) {
    const f = (row.decision_feedback ?? {}) as Record<string, unknown>;
    const reviewedAt = Date.parse(String(f.reviewed_at ?? ""));
    if (!Number.isFinite(reviewedAt) || reviewedAt < sinceMs) continue;
    total += 1;
    if (f.is_correct === false) negative += 1;
  }
  if (total < 10) return clinicMetadata;
  const negativeRate = total ? negative / total : 0;
  if (negativeRate <= 0.35) return clinicMetadata;

  const lastSafe = aiCalibration.last_safe;
  if (!lastSafe || typeof lastSafe !== "object") return clinicMetadata;
  const next = {
    ...aiCalibration,
    current: lastSafe,
    suggested: null,
    watch_until: null,
    last_action: "auto_rollback_watch_window",
    last_updated: new Date().toISOString(),
    watch_negative_feedback_rate: Number(negativeRate.toFixed(4)),
  };
  await pool.query(
    `UPDATE clinics
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify({ ai_calibration: next }), clinicId],
  );
  incProductMetric("calibration_rollback_total");
  return { ...clinicMetadata, ai_calibration: next };
}

async function formatSlotLabel(pool: Pool, clinicId: number, startsAtIso: string): Promise<string> {
  const tzR = await pool.query(`SELECT timezone FROM clinics WHERE id = $1`, [clinicId]);
  const zone = (tzR.rows[0]?.timezone as string) || "Asia/Amman";
  const local = DateTime.fromISO(startsAtIso, { zone: "utc" }).setZone(zone);
  return local.isValid ? formatDateTimeAr(local) : startsAtIso;
}

async function persistDialogueMergeAndOutbound(
  pool: Pool,
  args: {
    clinic_id: number;
    patient_id: number;
    conversation_id: number;
    merge: Record<string, unknown>;
    reply_text: string;
    intent: string;
    priority: number;
    is_urgent: boolean;
    decision_source: string;
  },
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE conversations
       SET dialogue_state = COALESCE(dialogue_state, '{}'::jsonb) || $1::jsonb,
           dialogue_version = dialogue_version + 1,
           state = 'ACTIVE',
           updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3`,
      [JSON.stringify(args.merge), args.conversation_id, args.clinic_id],
    );
    await client.query(
      `INSERT INTO messages (
         clinic_id, conversation_id, patient_id, direction, text, intent, priority, is_urgent, dedup_skipped, source, payload, created_at
       ) VALUES (
         $1, $2, $3, 'outbound', $4, $5, $6, $7, false, 'process_inbound',
         $8::jsonb, NOW()
       )`,
      [
        args.clinic_id,
        args.conversation_id,
        args.patient_id,
        args.reply_text,
        args.intent.slice(0, 120),
        args.priority,
        args.is_urgent,
        JSON.stringify({ decision_source: args.decision_source }),
      ],
    );
    const verR = await client.query(`SELECT dialogue_version FROM conversations WHERE id = $1`, [args.conversation_id]);
    await client.query("COMMIT");
    return Number(verR.rows[0]?.dialogue_version ?? 0);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function insertOutboundOnly(
  pool: Pool,
  args: {
    clinic_id: number;
    patient_id: number;
    conversation_id: number;
    reply_text: string;
    intent: string;
    priority: number;
    is_urgent: boolean;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const enq = await maybeEnqueueOutboundMessageRow({
    clinic_id: args.clinic_id,
    patient_id: args.patient_id,
    conversation_id: args.conversation_id,
    reply_text: args.reply_text,
    intent: args.intent,
    priority: args.priority,
    is_urgent: args.is_urgent,
    payload: args.payload,
  });
  if (enq) return;
  await pool.query(
    `INSERT INTO messages (
       clinic_id, conversation_id, patient_id, direction, text, intent, priority, is_urgent, dedup_skipped, source, payload, created_at
     ) VALUES (
       $1, $2, $3, 'outbound', $4, $5, $6, $7, false, 'process_inbound', $8::jsonb, NOW()
     )`,
    [
      args.clinic_id,
      args.conversation_id,
      args.patient_id,
      args.reply_text,
      args.intent.slice(0, 120),
      args.priority,
      args.is_urgent,
      JSON.stringify(args.payload),
    ],
  );
}

async function persistPostDecision(
  client: PoolClient,
  args: {
    clinic_id: number;
    patient_id: number;
    conversation_id: number;
    text: string;
    dec: SchedulingDecision;
    alertTo: string;
  },
): Promise<{ case_id: number | null; alert_id: number | null; dialogue_version: number }> {
  const { clinic_id, patient_id, conversation_id, text, dec, alertTo } = args;

  const vRow = await client.query(`SELECT dialogue_version FROM conversations WHERE id = $1 FOR UPDATE`, [
    conversation_id,
  ]);
  const expectedVersion = Number(vRow.rows[0]?.dialogue_version ?? 0);

  const convState = dec.finalIntent === "URGENT" || dec.handoffRequired ? "TRIAGE" : "ACTIVE";
  const flowStep = dec.decisionSource === "scheduling_engine" ? "slot_offer" : "idle";
  const slots = (dec.schedulingSlots || []) as { starts_at: string; doctor_id: number; doctor_name: string }[];
  const pending_slots = slots.map((s, i) => ({
    ix: i + 1,
    starts_at: s.starts_at,
    doctor_id: s.doctor_id,
    doctor_name: s.doctor_name,
  }));
  const dialoguePatch = {
    flow_step: flowStep,
    last_intent: dec.finalIntent,
    slot_offers: dec.schedulingSlots ?? [],
    pending_kind: flowStep === "slot_offer" ? "slots" : null,
    pending_slots: flowStep === "slot_offer" ? pending_slots : [],
    pending_doctors: [],
    pending_clinics: [],
    pending_selection: null,
    decision_source: dec.decisionSource,
    updated_at: new Date().toISOString(),
  };

  const upd = await client.query(
    `UPDATE conversations
     SET state = $1,
         dialogue_state = COALESCE(dialogue_state, '{}'::jsonb) || $2::jsonb,
         dialogue_version = dialogue_version + 1,
         updated_at = NOW()
     WHERE id = $3 AND clinic_id = $4 AND dialogue_version = $5`,
    [convState, JSON.stringify(dialoguePatch), conversation_id, clinic_id, expectedVersion],
  );

  if (upd.rowCount === 0) {
    await client.query(
      `UPDATE conversations
       SET state = $1,
           dialogue_state = COALESCE(dialogue_state, '{}'::jsonb) || $2::jsonb,
           dialogue_version = dialogue_version + 1,
           updated_at = NOW()
       WHERE id = $3 AND clinic_id = $4`,
      [convState, JSON.stringify(dialoguePatch), conversation_id, clinic_id],
    );
  }

  const verR = await client.query(`SELECT dialogue_version FROM conversations WHERE id = $1`, [conversation_id]);
  const dialogue_version = Number(verR.rows[0]?.dialogue_version ?? 0);

  const handoff = needsHandoff(dec);
  let case_id: number | null = null;
  let alert_id: number | null = null;

  if (handoff) {
    const c = await client.query(
      `INSERT INTO cases (
         clinic_id, patient_id, conversation_id, case_type, priority, status, summary, notes, source, opened_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, NOW(), NOW(), NOW())
       RETURNING id`,
      [
        clinic_id,
        patient_id,
        conversation_id,
        dec.finalIntent,
        casePriorityFrom(dec.finalPriority),
        text,
        "Created by process-inbound",
        "process_inbound",
      ],
    );
    case_id = Number(c.rows[0].id);

    if (alertTo.trim()) {
      const a = await client.query(
        `INSERT INTO alerts (
           clinic_id, conversation_id, patient_id, alert_type, target, status, notes, payload, created_at
         ) VALUES ($1, $2, $3, $4, $5, 'queued', 'process-inbound alert', $6::jsonb, NOW())
         RETURNING id`,
        [
          clinic_id,
          conversation_id,
          patient_id,
          dec.finalIntent,
          alertTo,
          JSON.stringify({ decision_source: dec.decisionSource }),
        ],
      );
      alert_id = Number(a.rows[0].id);
    }
  }

  const patientReply = handoff
    ? "تم تحويل رسالتك للفريق المختص وسيتم التواصل معك بأسرع وقت."
    : dec.finalReply;

  await client.query(
    `INSERT INTO messages (
       clinic_id, conversation_id, patient_id, direction, text, intent, priority, is_urgent, dedup_skipped, source, payload, created_at
     ) VALUES (
       $1, $2, $3, 'outbound', $4, $5, $6, $7, false, 'process_inbound',
       $8::jsonb, NOW()
     )`,
    [
      clinic_id,
      conversation_id,
      patient_id,
      patientReply,
      dec.finalIntent.slice(0, 120),
      dec.finalPriority,
      dec.finalIntent === "URGENT",
      JSON.stringify({ decision_source: dec.decisionSource, ai_used: dec.aiValid }),
    ],
  );

  return { case_id, alert_id, dialogue_version };
}

async function sendPatientAndOptionalAlert(
  pool: Pool,
  args: {
    from: string;
    patientReply: string;
    handoff: boolean;
    execute_send: boolean;
    send_urgent_alert: boolean;
    enqueue_on_bridge_failure: boolean;
    normAlertTo: string;
    urgentAlertText: string;
    clinic_id: number;
    conversation_id: number;
    patient_id: number;
    correlationId?: string;
  },
): Promise<{
  bridge_send_ok: boolean;
  bridge_send_error: string | null;
  urgent_alert_sent: boolean;
  urgent_alert_error: string | null;
  outbox_ids: number[];
}> {
  let bridge_send_ok = true;
  let bridge_send_error: string | null = null;
  let urgent_alert_sent = false;
  let urgent_alert_error: string | null = null;
  const outbox_ids: number[] = [];

  const messaging = getDefaultMessagingAdapter();
  if (args.execute_send && args.handoff && args.send_urgent_alert && args.normAlertTo.trim()) {
    const ur = await messaging.send({
      to: args.normAlertTo,
      text: args.urgentAlertText,
      policy: { kind: "staff_alert" },
      correlationId: args.correlationId,
      clinicId: args.clinic_id,
    });
    if (ur.ok) urgent_alert_sent = true;
    else {
      urgent_alert_error = ur.detail;
      if (args.enqueue_on_bridge_failure) {
        const id = await enqueueCoreOutbox(pool, {
          clinic_id: args.clinic_id,
          conversation_id: args.conversation_id,
          job_type: "whatsapp_send",
          payload: { to: args.normAlertTo, text: args.urgentAlertText, kind: "urgent_alert" },
        });
        outbox_ids.push(id);
      }
    }
  }

  if (args.execute_send) {
    const patientText = args.patientReply;
    const sr = await sendPatientWhatsAppGuarded({
      to: args.from,
      text: patientText,
      context: "inbound_sync_reply",
      correlationId: args.correlationId,
      clinicId: args.clinic_id,
      conversationId: args.conversation_id,
    });
    if (!sr.ok) {
      bridge_send_ok = false;
      bridge_send_error = sr.detail;
      if (args.enqueue_on_bridge_failure) {
        const id = await enqueueCoreOutbox(pool, {
          clinic_id: args.clinic_id,
          conversation_id: args.conversation_id,
          job_type: "whatsapp_send",
          payload: {
            to: args.from,
            text: patientText,
            kind: "patient_reply",
            patient_id: args.patient_id,
            conversation_id: args.conversation_id,
            last_inbound_at: new Date().toISOString(),
          },
        });
        outbox_ids.push(id);
      }
    }
  }

  return { bridge_send_ok, bridge_send_error, urgent_alert_sent, urgent_alert_error, outbox_ids };
}

export async function processInboundPostIngest(
  pool: Pool,
  crm: InboundIngestRow,
  norm: NormalizedInboundRules,
  raw: ProcessInboundInput,
  ctx?: ProcessInboundContext,
): Promise<ProcessInboundResult> {
  const execute_send = raw.execute_send !== false;
  const send_urgent_alert = raw.send_urgent_alert !== false;
  const enqueue_on_bridge_failure = raw.enqueue_on_bridge_failure !== false;

  let schedulingReplyAppend: string | null = null;

  const autoReplyAllowed = await canClinicAutoReply(pool, crm.clinic_id);
  if (!autoReplyAllowed) {
    incProductMetric("process_inbound_blocked_billing_total");
    incProductMetric("billing_blocked_attempt_total");
    incProductMetric("billing_blocked_patient_message_total");
    return {
      ok: true,
      duplicate: false,
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      conversation_id: crm.conversation_id,
      inbound_message_id: crm.inbound_message_id,
      dedupeHash: crm.dedupeHash,
      finalIntent: "billing_locked",
      finalPriority: 2,
      reply_text: BILLING_LOCKED_REPLY_AR,
      decision_source: "billing_lock",
      handoff_required: false,
      bridge_send_ok: true,
      billing_locked: true,
      workflow_latency_ms: Date.now() - norm.workflowStartedAt,
    };
  }

  const clinicMetaR = await pool.query(`SELECT metadata FROM clinics WHERE id = $1`, [crm.clinic_id]);
  let clinicMetadata = (clinicMetaR.rows[0]?.metadata ?? {}) as Record<string, unknown>;
  let calibrationCurrent = getCurrentCalibrationThresholds(clinicMetadata);
  const uncertainModeEnabled = clinicMetadata.ai_uncertain_mode_enabled !== false;

  const cachedCtx = await getConvContextFromCache(crm.clinic_id, crm.conversation_id);
  let dialogue: ReturnType<typeof parseDialogueState>;
  let routing: Record<string, unknown>;
  if (cachedCtx) {
    dialogue = parseDialogueState(cachedCtx.dialogue_state);
    routing = cachedCtx.routing;
  } else {
    const convRow = await pool.query(`SELECT dialogue_state, routing FROM conversations WHERE id = $1`, [
      crm.conversation_id,
    ]);
    dialogue = parseDialogueState(convRow.rows[0]?.dialogue_state);
    routing = (convRow.rows[0]?.routing as Record<string, unknown>) || {};
    void setConvContextCache(crm.clinic_id, crm.conversation_id, {
      dialogue_state: convRow.rows[0]?.dialogue_state ?? null,
      routing,
    });
  }

  // Ephemeral merge: surface inbound-route allowed_clinic_ids to the booking FSM
  // via the in-memory `routing` object. Not written back to DB (would otherwise
  // grow conversations.routing with redundant config).
  if (ctx?.routeAllowedClinicIds && ctx.routeAllowedClinicIds.length) {
    routing = { ...routing, allowed_clinic_ids: ctx.routeAllowedClinicIds };
  }

  clinicMetadata = await maybeAutoRollbackWatchWindow(pool, crm.clinic_id, clinicMetadata);
  clinicMetadata = await maybeActivateEmergencyThrottle(pool, crm.clinic_id, clinicMetadata);
  calibrationCurrent = getCurrentCalibrationThresholds(clinicMetadata);

  const selClinic = routing.selected_clinic_id;
  if (typeof selClinic === "number" && Number.isFinite(selClinic)) {
    void maybePrefetchClinicScheduleAfterRoutingLock(pool, selClinic).catch(() => undefined);
  }

  const runEmergencyFlow = async (
    source: "system_event" | "intent_emergency",
    opts?: { allowNextDayOverride?: boolean },
  ): Promise<ProcessInboundResult> => {
    incProductMetric("emergency_detected_total");
    const emergencyDisabled = await getRuntimeFlag("emergency_global_disable", { pool });
    const outcome = emergencyDisabled
      ? ({ ok: false, reason: "allocation_failed" } as Awaited<ReturnType<typeof runEmergencyDecisionEngine>>)
      : await runEmergencyDecisionEngine(pool, crm, opts);
    let replyText = "";
    let finalIntent = "URGENT";
    let handoffRequired = false;
    let bridge_send_ok = true;
    let bridge_send_error: string | null = null;
    let urgent_alert_sent = false;
    let urgent_alert_error: string | null = null;
    const outbox_ids: number[] = [];
    const messaging = getDefaultMessagingAdapter();
    let bumped_count = 0;
    let bumped_notified = 0;

    if (outcome.ok) {
      incProductMetric("emergency_rescheduled_total");
      const when = await formatSlotLabel(pool, crm.clinic_id, outcome.starts_at);
      const inMin = Math.max(1, Math.round((new Date(outcome.starts_at).getTime() - Date.now()) / (60 * 1000)));
      if (outcome.outcome === "allocated_next_day_override") {
        incProductMetric("emergency_next_day_override_total");
        replyText = `تم تسجيل حالتك كحالة طارئة 🚨\nلا يوجد شاغر اليوم، وتم تفعيل استثناء الطوارئ وتخصيص أقرب موعد لك: ${when}.\nإذا ساءت الحالة يرجى مراجعة الطوارئ فورًا.`;
      } else {
        replyText = `تم تسجيل حالتك كحالة طارئة 🚨\nتم تخصيص أقرب موعد لك خلال ${inMin} دقيقة (${when}).\nيرجى التوجه فورًا.`;
      }
      finalIntent = "EMERGENCY";
      const merge = {
        flow_step: "done",
        last_intent: "EMERGENCY",
        emergency: {
          source,
          starts_at: outcome.starts_at,
          doctor_id: outcome.doctor_id,
          appointment_id: outcome.appointment_id,
        },
        pending_kind: null,
        pending_slots: [],
        pending_doctors: [],
        pending_clinics: [],
        updated_at: new Date().toISOString(),
      };
      const emergencyRouting = {
        last_emergency_event: {
          source,
          status: "allocated",
          starts_at: outcome.starts_at,
          doctor_id: outcome.doctor_id,
          appointment_id: outcome.appointment_id,
          allow_next_day_override: Boolean(opts?.allowNextDayOverride),
          outcome: outcome.outcome,
          ts: new Date().toISOString(),
        },
        decision_priority: "critical",
      };
      await pool.query(
        `UPDATE conversations
         SET state = 'ACTIVE',
             dialogue_state = COALESCE(dialogue_state, '{}'::jsonb) || $1::jsonb,
             routing = COALESCE(routing, '{}'::jsonb) || $4::jsonb,
             dialogue_version = dialogue_version + 1,
             updated_at = NOW()
         WHERE id = $2 AND clinic_id = $3`,
        [JSON.stringify(merge), crm.conversation_id, crm.clinic_id, JSON.stringify(emergencyRouting)],
      );
      await insertOutboundOnly(pool, {
        clinic_id: crm.clinic_id,
        patient_id: crm.patient_id,
        conversation_id: crm.conversation_id,
        reply_text: replyText,
        intent: finalIntent,
        priority: 1,
        is_urgent: true,
        payload: { decision_source: "emergency_engine", source, outcome: outcome.outcome },
      });
      await upsertPatientConversationMemory(pool, {
        clinic_id: crm.clinic_id,
        patient_id: crm.patient_id,
        facts_patch: {
          last_clinic_id: crm.clinic_id,
          preferred_doctor_id: outcome.doctor_id,
          last_visit_date: outcome.starts_at,
          medical_flags: ["emergency_recent"],
        },
      }).catch(() => undefined);

      if (outcome.outcome === "allocated_with_soft_bump" && outcome.bumped.chat_id) {
        bumped_count = 1;
        const bumpedWhen = await formatSlotLabel(pool, crm.clinic_id, outcome.bumped.rescheduled_starts_at);
        const bumpedMsg = `نعتذر، تم تأجيل موعدك بسبب حالة طارئة.\nتم نقلك إلى ${bumpedWhen}.\nنقدّر تفهمك.`;
        await pool.query(
          `INSERT INTO messages (
             clinic_id, conversation_id, patient_id, direction, text, intent, priority, is_urgent, dedup_skipped, source, payload, created_at
           ) VALUES (
             $1, $2, $3, 'outbound', $4, 'GENERAL', 2, false, false, 'process_inbound', $5::jsonb, NOW()
           )`,
          [
            crm.clinic_id,
            outcome.bumped.conversation_id ?? crm.conversation_id,
            outcome.bumped.patient_id,
            bumpedMsg,
            JSON.stringify({ emergency_conversation_id: crm.conversation_id, kind: "emergency_bump_notice" }),
          ],
        );
        if (execute_send) {
          const bumpedPolicy = await resolveEmergencySendPolicy(pool, {
            clinicId: crm.clinic_id,
            patientId: outcome.bumped.patient_id,
          });
          if (bumpedPolicy.mode === "freeform") {
            const bumpedSend = await sendPatientWhatsAppGuarded({
              to: outcome.bumped.chat_id,
              text: bumpedMsg,
              context: "inbound_sync_reply",
              correlationId: ctx?.correlationId,
              clinicId: crm.clinic_id,
              conversationId: outcome.bumped.conversation_id ?? crm.conversation_id,
            });
            if (!bumpedSend.ok) {
              bridge_send_ok = false;
              bridge_send_error = bumpedSend.detail;
              incProductMetric("emergency_bump_notify_failed_total");
              if (enqueue_on_bridge_failure) {
                const oid = await enqueueCoreOutbox(pool, {
                  clinic_id: crm.clinic_id,
                  conversation_id: outcome.bumped.conversation_id ?? crm.conversation_id,
                  job_type: "whatsapp_send",
                  payload: {
                    to: outcome.bumped.chat_id,
                    text: bumpedMsg,
                    kind: "patient_reply",
                    patient_id: outcome.bumped.patient_id,
                    conversation_id: outcome.bumped.conversation_id ?? crm.conversation_id,
                    last_inbound_at: new Date().toISOString(),
                  },
                });
                outbox_ids.push(oid);
              }
            } else {
              bumped_notified = 1;
              incProductMetric("emergency_bump_notified_total");
            }
          }
        }
      }
      await pool.query(
        `UPDATE conversations
         SET routing = COALESCE(routing, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2 AND clinic_id = $3`,
        [
          JSON.stringify({
            last_emergency_event: {
              source,
              status: "allocated",
              starts_at: outcome.starts_at,
              doctor_id: outcome.doctor_id,
              appointment_id: outcome.appointment_id,
              allow_next_day_override: Boolean(opts?.allowNextDayOverride),
              outcome: outcome.outcome,
              bumped_count,
              bumped_notified,
              ts: new Date().toISOString(),
            },
            decision_priority: "critical",
          }),
          crm.conversation_id,
          crm.clinic_id,
        ],
      );
    } else {
      incProductMetric("emergency_handoff_total");
      handoffRequired = true;
      const handoffReason = emergencyDisabled ? "global_disabled" : outcome.reason;
      replyText =
        emergencyDisabled
          ? "تم تسجيل حالتك كطارئة 🚨\nنظام الطوارئ الآلي متوقف حاليًا، وتم تصعيد الحالة مباشرة للفريق المختص."
          : "تم تسجيل حالتك كطارئة 🚨\nتعذر إعادة الجدولة تلقائيًا اليوم، وتم تصعيد الحالة مباشرة للفريق المختص.";
      await insertOutboundOnly(pool, {
        clinic_id: crm.clinic_id,
        patient_id: crm.patient_id,
        conversation_id: crm.conversation_id,
        reply_text: replyText,
        intent: finalIntent,
        priority: 1,
        is_urgent: true,
        payload: { decision_source: "emergency_engine_handoff", reason: handoffReason },
      });
      await pool.query(
        `UPDATE conversations
         SET routing = COALESCE(routing, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2 AND clinic_id = $3`,
        [
          JSON.stringify({
            last_emergency_event: {
              source,
              status: "handoff",
              reason: handoffReason,
              ts: new Date().toISOString(),
            },
            decision_priority: "critical",
          }),
          crm.conversation_id,
          crm.clinic_id,
        ],
      );
      if (norm.alertTo.trim()) {
        const urgentAlertText = `🚨 Emergency handoff\nPatient: ${crm.from}\nReason: ${handoffReason}\nText: ${crm.text}`.slice(
          0,
          3500,
        );
        if (execute_send && send_urgent_alert) {
          const ur = await messaging.send({
            to: norm.alertTo,
            text: urgentAlertText,
            policy: { kind: "staff_alert" },
            correlationId: ctx?.correlationId,
            clinicId: crm.clinic_id,
          });
          if (ur.ok) urgent_alert_sent = true;
          else urgent_alert_error = ur.detail;
        }
      }
    }

    if (execute_send) {
      const policy = await resolveEmergencySendPolicy(pool, {
        clinicId: crm.clinic_id,
        patientId: crm.patient_id,
      });
      if (policy.mode === "freeform") {
        const sr = await sendPatientWhatsAppGuarded({
          to: crm.from,
          text: replyText,
          context: "inbound_sync_reply",
          correlationId: ctx?.correlationId,
          clinicId: crm.clinic_id,
          conversationId: crm.conversation_id,
        });
        if (!sr.ok) {
          bridge_send_ok = false;
          bridge_send_error = sr.detail;
          if (enqueue_on_bridge_failure) {
            const oid = await enqueueCoreOutbox(pool, {
              clinic_id: crm.clinic_id,
              conversation_id: crm.conversation_id,
              job_type: "whatsapp_send",
              payload: {
                to: crm.from,
                text: replyText,
                kind: "patient_reply",
                patient_id: crm.patient_id,
                conversation_id: crm.conversation_id,
                last_inbound_at: new Date().toISOString(),
              },
            });
            outbox_ids.push(oid);
          }
        }
      } else {
        bridge_send_ok = false;
        bridge_send_error = "template_required";
        replyText = `${replyText}\n${templateRequiredMessageAr()}`;
      }
    }

    const ver = await pool.query(`SELECT dialogue_version FROM conversations WHERE id = $1`, [crm.conversation_id]);
    return {
      ok: true,
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      conversation_id: crm.conversation_id,
      inbound_message_id: crm.inbound_message_id,
      dedupeHash: crm.dedupeHash,
      finalIntent,
      finalPriority: 1,
      reply_text: replyText,
      decision_source: outcome.ok ? "emergency_engine" : "emergency_engine_handoff",
      handoff_required: handoffRequired,
      bridge_send_ok,
      bridge_send_error,
      urgent_alert_sent,
      urgent_alert_error,
      outbox_ids: outbox_ids.length ? outbox_ids : undefined,
      workflow_latency_ms: Date.now() - norm.workflowStartedAt,
      dialogue_version: Number(ver.rows[0]?.dialogue_version ?? 0),
    };
  };

  const systemEvent = parseSystemEvent(crm.text);
  if (systemEvent?.event === "emergency_override") {
    const allowNextDayOverride = Boolean(systemEvent.context?.allow_next_day_override === true);
    return runEmergencyFlow("system_event", { allowNextDayOverride });
  }

  const consumed = await tryConsumeBookingDialogueTurn(pool, { crm, norm, dialogue, routing });
  if (consumed) {
    incProductMetric("process_inbound_booking_consumed_total");
    let patientReply = consumed.reply_text;
    let dialogue_version = 0;

    if (consumed.postProcess) {
      const pr = await consumed.postProcess(pool);
      patientReply = pr.patient_reply;
      if (pr.failed) {
        await insertOutboundOnly(pool, {
          clinic_id: crm.clinic_id,
          patient_id: crm.patient_id,
          conversation_id: crm.conversation_id,
          reply_text: patientReply,
          intent: "BOOKING",
          priority: 2,
          is_urgent: false,
          payload: { decision_source: consumed.decision_source, confirm_failed: true },
        });
        const ver = await pool.query(`SELECT dialogue_version FROM conversations WHERE id = $1`, [crm.conversation_id]);
        dialogue_version = Number(ver.rows[0]?.dialogue_version ?? 0);
      } else {
        await insertOutboundOnly(pool, {
          clinic_id: crm.clinic_id,
          patient_id: crm.patient_id,
          conversation_id: crm.conversation_id,
          reply_text: patientReply,
          intent: "BOOKING",
          priority: 2,
          is_urgent: false,
          payload: {
            decision_source: consumed.decision_source,
            appointment_id: pr.appointment_id,
            duplicate: pr.duplicate ?? false,
          },
        });
        const ver = await pool.query(`SELECT dialogue_version FROM conversations WHERE id = $1`, [crm.conversation_id]);
        dialogue_version = Number(ver.rows[0]?.dialogue_version ?? 0);
      }
    } else if (Object.keys(consumed.dialogueMerge).length > 0 || consumed.reply_text) {
      dialogue_version = await persistDialogueMergeAndOutbound(pool, {
        clinic_id: crm.clinic_id,
        patient_id: crm.patient_id,
        conversation_id: crm.conversation_id,
        merge: consumed.dialogueMerge,
        reply_text: consumed.reply_text,
        intent: consumed.finalIntent,
        priority: consumed.finalPriority,
        is_urgent: false,
        decision_source: consumed.decision_source,
      });
      void invalidateConvContextCache(crm.clinic_id, crm.conversation_id);
    }

    if (consumed.failsafeAlert && norm.alertTo.trim()) {
      await pool.query(
        `INSERT INTO alerts (
           clinic_id, conversation_id, patient_id, alert_type, target, status, notes, payload, created_at
         ) VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7::jsonb, NOW())`,
        [
          crm.clinic_id,
          crm.conversation_id,
          crm.patient_id,
          consumed.failsafeAlert.alert_type,
          norm.alertTo.trim(),
          consumed.failsafeAlert.notes,
          JSON.stringify({ decision_source: consumed.decision_source, kind: "dialogue_failsafe" }),
        ],
      );
    }

    const send = await sendPatientAndOptionalAlert(pool, {
      from: crm.from,
      patientReply,
      handoff: consumed.handoff_required,
      execute_send,
      send_urgent_alert,
      enqueue_on_bridge_failure,
      normAlertTo: norm.alertTo,
      urgentAlertText: "",
      clinic_id: crm.clinic_id,
      conversation_id: crm.conversation_id,
      patient_id: crm.patient_id,
      correlationId: ctx?.correlationId,
    });

    const workflow_latency_ms = Date.now() - norm.workflowStartedAt;
    return {
      ok: true,
      duplicate: false,
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      conversation_id: crm.conversation_id,
      inbound_message_id: crm.inbound_message_id,
      dedupeHash: crm.dedupeHash,
      finalIntent: consumed.finalIntent,
      finalPriority: consumed.finalPriority,
      reply_text: patientReply,
      decision_source: consumed.decision_source,
      handoff_required: consumed.handoff_required,
      bridge_send_ok: send.bridge_send_ok,
      bridge_send_error: send.bridge_send_error,
      urgent_alert_sent: send.urgent_alert_sent,
      urgent_alert_error: send.urgent_alert_error,
      outbox_ids: send.outbox_ids.length ? send.outbox_ids : undefined,
      case_id: null,
      alert_id: null,
      workflow_latency_ms,
      dialogue_version,
    };
  }

  const deliverDialogueTurn = async (turn: ConsumedBookingTurn): Promise<ProcessInboundResult> => {
    const dialogue_version = await persistDialogueMergeAndOutbound(pool, {
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      conversation_id: crm.conversation_id,
      merge: turn.dialogueMerge,
      reply_text: turn.reply_text,
      intent: turn.finalIntent,
      priority: turn.finalPriority,
      is_urgent: false,
      decision_source: turn.decision_source,
    });
    void invalidateConvContextCache(crm.clinic_id, crm.conversation_id);
    const send = await sendPatientAndOptionalAlert(pool, {
      from: crm.from,
      patientReply: turn.reply_text,
      handoff: turn.handoff_required,
      execute_send,
      send_urgent_alert,
      enqueue_on_bridge_failure,
      normAlertTo: norm.alertTo,
      urgentAlertText: "",
      clinic_id: crm.clinic_id,
      conversation_id: crm.conversation_id,
      patient_id: crm.patient_id,
      correlationId: ctx?.correlationId,
    });
    return {
      ok: true,
      duplicate: false,
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      conversation_id: crm.conversation_id,
      inbound_message_id: crm.inbound_message_id,
      dedupeHash: crm.dedupeHash,
      finalIntent: turn.finalIntent,
      finalPriority: turn.finalPriority,
      reply_text: turn.reply_text,
      decision_source: turn.decision_source,
      handoff_required: turn.handoff_required,
      bridge_send_ok: send.bridge_send_ok,
      bridge_send_error: send.bridge_send_error,
      urgent_alert_sent: send.urgent_alert_sent,
      urgent_alert_error: send.urgent_alert_error,
      outbox_ids: send.outbox_ids.length ? send.outbox_ids : undefined,
      case_id: null,
      alert_id: null,
      workflow_latency_ms: Date.now() - norm.workflowStartedAt,
      dialogue_version,
    };
  };

  if (dialogue.flow_step === "awaiting_main_menu") {
    const menuConsumed = await tryConsumeMainMenuTurn(pool, { crm, norm, dialogue, routing });
    if (menuConsumed) {
      return deliverDialogueTurn(menuConsumed);
    }
  }

  const ollamaConfigured = Boolean((process.env.OLLAMA_URL || "").trim());
  const interpretText = applyIntentOverlayIfApplicable(crm.text);
  const memory = await fetchPatientConversationMemory(pool, crm.clinic_id, crm.patient_id).catch(() => null);
  const knownEntities = {
    patient_display_name: crm.patient_display_name,
    memory_summary_ar: memory?.summary_ar ?? null,
    memory_last_clinic_id: memory?.facts_jsonb?.last_clinic_id ?? null,
    memory_preferred_doctor_id: memory?.facts_jsonb?.preferred_doctor_id ?? null,
    memory_last_visit_date: memory?.facts_jsonb?.last_visit_date ?? null,
    memory_medical_flags: memory?.facts_jsonb?.medical_flags ?? null,
  };
  const brainCtx = { dialogueState: dialogue, routing, knownEntities };

  let hybridSkipMainMenu = false;
  let int!: Awaited<ReturnType<typeof interpretInboundText>>;
  let aiInterpretApplied = false;

  if (ollamaConfigured && dialogue.flow_step === "idle" && norm.ruleIntent !== "URGENT") {
    const hybrid = await tryHybridBrainRoute(pool, {
      crm,
      norm,
      dialogue,
      routing,
      interpretText,
      brainCtx,
    });
    if (hybrid?.action === "consumed") {
      return deliverDialogueTurn(hybrid.turn);
    }
    if (hybrid?.action === "handoff") {
      void invalidateConvContextCache(crm.clinic_id, crm.conversation_id);
      return {
        ok: true,
        duplicate: false,
        clinic_id: crm.clinic_id,
        patient_id: crm.patient_id,
        conversation_id: crm.conversation_id,
        inbound_message_id: crm.inbound_message_id,
        dedupeHash: crm.dedupeHash,
        finalIntent: hybrid.interpret.intent.toUpperCase(),
        finalPriority: 2,
        reply_text: "",
        decision_source: "hybrid_brain_handoff",
        handoff_required: true,
        bridge_send_ok: true,
        workflow_latency_ms: Date.now() - norm.workflowStartedAt,
      };
    }
    if (hybrid?.action === "continue") {
      int = hybrid.interpret;
      aiInterpretApplied = true;
      hybridSkipMainMenu = true;
    }
    if (hybrid?.action === "menu") {
      return deliverDialogueTurn(offerMainMenuTurn());
    }
  }

  if (!hybridSkipMainMenu && shouldOfferMainMenu(dialogue, norm)) {
    return deliverDialogueTurn(offerMainMenuTurn());
  }

  const interpretFastPath =
    !ollamaConfigured &&
    (process.env.INBOUND_INTERPRET_FAST_PATH || "").trim() !== "false" &&
    dialogue.flow_step === "idle" &&
    norm.ruleIntent !== "URGENT";

  const aiThreshold = getAIConfidenceThreshold();
  const externalAiConfigured = Boolean((process.env.EXTERNAL_AI_URL || "").trim());

  if (externalAiConfigured) {
  try {
    const adapter = getAIAdapter();
    const aiInput = await buildAIAnalysisInput(pool, crm, interpretText);
    const aiResult = await adapter.analyze(aiInput);

    if (aiResult.needs_human) {
      await setConversationHandoffPending(
        pool,
        crm.conversation_id,
        crm.clinic_id,
        aiResult.needs_human_reason || "ai_needs_human",
      );
      void invalidateConvContextCache(crm.clinic_id, crm.conversation_id);
      incProductMetric("process_inbound_ai_handoff_total");
      return {
        ok: true,
        duplicate: false,
        clinic_id: crm.clinic_id,
        patient_id: crm.patient_id,
        conversation_id: crm.conversation_id,
        inbound_message_id: crm.inbound_message_id,
        dedupeHash: crm.dedupeHash,
        finalIntent: aiResult.intent.toUpperCase(),
        finalPriority: 2,
        reply_text: "",
        decision_source: "ai_handoff_pending",
        handoff_required: true,
        bridge_send_ok: true,
        workflow_latency_ms: Date.now() - norm.workflowStartedAt,
      };
    }

    if (aiResult.confidence > aiThreshold) {
      int = aiAnalysisToInterpretResult(
        aiResult,
        externalAiConfigured ? "external_ai" : "heuristic_adapter",
      );
      aiInterpretApplied = true;
      incProductMetric("process_inbound_ai_adapter_applied_total");
    }
  } catch {
    incProductMetric("process_inbound_ai_adapter_fallback_total");
  }
  }

  if (!aiInterpretApplied) {
    if (interpretFastPath) {
      incProductMetric("process_inbound_interpret_skipped_total");
      int = interpretInboundHeuristic(interpretText);
    } else {
      const allowAi = await tryAcquireAiBudgetSlot(crm.conversation_id);
      if (!allowAi) {
        if ((process.env.INBOUND_AI_TOKEN_BUCKET || "").trim() === "1") {
          incProductMetric("process_inbound_ai_token_denied_total");
        } else {
          incProductMetric("process_inbound_ai_rate_limited_total");
        }
        int = interpretInboundHeuristic(interpretText);
      } else {
        int = await interpretInboundText(interpretText, brainCtx);
      }
    }
  }

  const aiCalibrationMeta = (clinicMetadata.ai_calibration ?? {}) as Record<string, unknown>;
  const calibrationVersionRaw = Number(aiCalibrationMeta.version ?? 0);
  const calibrationVersion = Number.isFinite(calibrationVersionRaw) ? Math.max(0, Math.floor(calibrationVersionRaw)) : 0;
  const conversationDecisionVersionRaw = Number(routing.decision_version);
  const conversationDecisionVersion = Number.isFinite(conversationDecisionVersionRaw)
    ? Math.max(0, Math.floor(conversationDecisionVersionRaw))
    : null;
  const decisionVersionLocked =
    conversationDecisionVersion !== null && calibrationVersion > 0 && conversationDecisionVersion !== calibrationVersion;
  const throttleUntil = emergencyThrottleUntilMs(clinicMetadata);
  const emergencyThrottleActive = throttleUntil != null && throttleUntil > Date.now();
  const manualOverrideActive = isManualOverrideActive(routing);

  if ((await isDecisionEngineEnabled()) && !decisionVersionLocked && !manualOverrideActive) {
    const decision = decideAction({
      interpret: int,
      conversation_id: crm.conversation_id,
      patient_id: crm.patient_id,
      calibration: {
        risk_threshold: calibrationCurrent.risk_threshold,
        confidence_threshold: calibrationCurrent.confidence_threshold,
        uncertain_mode_enabled: uncertainModeEnabled,
        medical_boosts: {
          breathing_issue: calibrationCurrent.medical_boosts.breathing_issue,
        },
      },
    });
    let decisionToExecute: Decision = decision;
    if (
      emergencyThrottleActive &&
      decision.type === "EMERGENCY" &&
      !String(decision.reason || "").startsWith("clinical_override:")
    ) {
      decisionToExecute = {
        ...decision,
        type: "UNKNOWN",
        actions: ["PRIORITIZE", "SEND_REPLY"],
        reason: "emergency_throttle_active",
        priority: 90,
      };
    }

    let shadowDecision:
      | {
          type: Decision["type"];
          reason: string;
          priority: number;
          mismatch: boolean;
          emergency_diff: boolean;
          severity_diff: number;
        }
      | null = null;
    const suggested = aiCalibrationMeta.suggested as Record<string, unknown> | null;
    if (suggested && typeof suggested === "object") {
      const shadow = decideAction({
        interpret: int,
        conversation_id: crm.conversation_id,
        patient_id: crm.patient_id,
        calibration: {
          risk_threshold: Number(suggested.suggested_risk_threshold ?? calibrationCurrent.risk_threshold),
          confidence_threshold: Number(
            suggested.suggested_confidence_threshold ?? calibrationCurrent.confidence_threshold,
          ),
          uncertain_mode_enabled: uncertainModeEnabled,
          medical_boosts: {
            breathing_issue: Number(
              suggested.suggested_breathing_boost ?? calibrationCurrent.medical_boosts.breathing_issue,
            ),
          },
        },
      });
      shadowDecision = {
        type: shadow.type,
        reason: shadow.reason,
        priority: shadow.priority,
        mismatch: shadow.type !== decisionToExecute.type,
        emergency_diff:
          (shadow.type === "EMERGENCY" && decisionToExecute.type !== "EMERGENCY") ||
          (shadow.type !== "EMERGENCY" && decisionToExecute.type === "EMERGENCY"),
        severity_diff: Number(((shadow.priority ?? 0) - (decisionToExecute.priority ?? 0)).toFixed(2)),
      };
    }

    const ex = await executeDecision(
      { pool, crm, interpret: int, calibrationVersion, shadowDecision },
      decisionToExecute,
    );
    schedulingReplyAppend = ex.schedulingReplyAppend;
    if (!ex.skipped_duplicate) {
      void invalidateConvContextCache(crm.clinic_id, crm.conversation_id);
    }
  } else if ((await isDecisionEngineEnabled()) && decisionVersionLocked) {
    incProductMetric("process_inbound_decision_version_locked_skip_total");
    await pool.query(
      `UPDATE conversations
       SET routing = COALESCE(routing, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3`,
      [
        JSON.stringify({
          skip_auto_re_evaluation: true,
          decision_version_mismatch: {
            routing_decision_version: conversationDecisionVersion,
            current_calibration_version: calibrationVersion,
            ts: new Date().toISOString(),
          },
        }),
        crm.conversation_id,
        crm.clinic_id,
      ],
    );
  } else if ((await isDecisionEngineEnabled()) && manualOverrideActive) {
    incProductMetric("process_inbound_decision_version_locked_skip_total");
  }

  const emergencySeverity = int.emergency?.severity ?? 1;
  const emergencyConfidence = Number.isFinite(int.confidence) ? Number(int.confidence) : 0;
  const emergencyRisk = Number(
    (
      Math.max(0, Math.min(1, emergencyConfidence)) * emergencySeverity +
      deriveEmergencyMedicalBoost(int, calibrationCurrent.medical_boosts.breathing_issue)
    ).toFixed(2),
  );
  const emergencyDetected =
    Boolean(int.emergency?.detected) ||
    int.urgency_level === "emergency" ||
    int.intent === "urgent" ||
    int.intent === "emergency";
  const clinicalEmergencyOverride = Boolean(int.medical_signals?.loss_of_consciousness);
  const allowEmergencyFlow =
    clinicalEmergencyOverride ||
    (!emergencyThrottleActive &&
      emergencyDetected &&
      emergencyRisk >= calibrationCurrent.risk_threshold &&
      emergencyConfidence >= calibrationCurrent.confidence_threshold);
  if (
    (int.system_event?.type === "system_event" &&
      String(int.system_event.event || "").toLowerCase() === "emergency_override") ||
    allowEmergencyFlow
  ) {
    const source =
      int.system_event?.type === "system_event" &&
      String(int.system_event.event || "").toLowerCase() === "emergency_override"
        ? "system_event"
        : "intent_emergency";
    const allowNextDayOverride =
      source === "system_event" ||
      emergencySeverity >= 5 ||
      Boolean((int.system_event?.context as Record<string, unknown> | null | undefined)?.allow_next_day_override === true);
    return runEmergencyFlow(source, { allowNextDayOverride });
  }

  if (int.intent === "booking") {
    const started = await startBookingDialogueFlow(pool, crm, norm, routing, int, crm.text);
    const dialogue_version = await persistDialogueMergeAndOutbound(pool, {
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      conversation_id: crm.conversation_id,
      merge: started.dialogueMerge,
      reply_text: started.reply_text,
      intent: started.finalIntent,
      priority: started.finalPriority,
      is_urgent: false,
      decision_source: started.decision_source,
    });
    void invalidateConvContextCache(crm.clinic_id, crm.conversation_id);
    const send = await sendPatientAndOptionalAlert(pool, {
      from: crm.from,
      patientReply: started.reply_text,
      handoff: started.handoff_required,
      execute_send,
      send_urgent_alert,
      enqueue_on_bridge_failure,
      normAlertTo: norm.alertTo,
      urgentAlertText: "",
      clinic_id: crm.clinic_id,
      conversation_id: crm.conversation_id,
      patient_id: crm.patient_id,
      correlationId: ctx?.correlationId,
    });
    return {
      ok: true,
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      conversation_id: crm.conversation_id,
      inbound_message_id: crm.inbound_message_id,
      dedupeHash: crm.dedupeHash,
      finalIntent: started.finalIntent,
      finalPriority: started.finalPriority,
      reply_text: started.reply_text,
      decision_source: started.decision_source,
      handoff_required: started.handoff_required,
      bridge_send_ok: send.bridge_send_ok,
      bridge_send_error: send.bridge_send_error,
      urgent_alert_sent: send.urgent_alert_sent,
      urgent_alert_error: send.urgent_alert_error,
      outbox_ids: send.outbox_ids.length ? send.outbox_ids : undefined,
      case_id: null,
      alert_id: null,
      workflow_latency_ms: Date.now() - norm.workflowStartedAt,
      dialogue_version,
    };
  }

  const dec = await runSchedulingDecision(pool, crm, norm, { interpret: int });
  const client = await pool.connect();
  let case_id: number | null = null;
  let alert_id: number | null = null;
  let dialogue_version = 0;
  try {
    await client.query("BEGIN");
    const r = await persistPostDecision(client, {
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      conversation_id: crm.conversation_id,
      text: crm.text,
      dec,
      alertTo: norm.alertTo,
    });
    case_id = r.case_id;
    alert_id = r.alert_id;
    dialogue_version = r.dialogue_version;
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  void invalidateConvContextCache(crm.clinic_id, crm.conversation_id);

  const handoff = needsHandoff(dec);
  let patientReply = handoff
    ? "تم تحويل رسالتك للفريق المختص وسيتم التواصل معك بأسرع وقت."
    : dec.finalReply;
  if (schedulingReplyAppend && !handoff && patientReply) {
    patientReply = `${patientReply}\n\n${schedulingReplyAppend}`.trim();
    incProductMetric("process_inbound_auto_reply_augment_total");
  }
  const urgentAlertText =
    `🚨 حالة تحتاج متابعة بشرية\nالمريض: ${crm.from}\nالنوع: ${dec.finalIntent}\nالأولوية: ${dec.finalPriority}\nالنص: ${crm.text}`.slice(
      0,
      3500,
    );
  const send = await sendPatientAndOptionalAlert(pool, {
    from: crm.from,
    patientReply,
    handoff,
    execute_send,
    send_urgent_alert,
    enqueue_on_bridge_failure,
    normAlertTo: norm.alertTo,
    urgentAlertText,
    clinic_id: crm.clinic_id,
    conversation_id: crm.conversation_id,
    patient_id: crm.patient_id,
    correlationId: ctx?.correlationId,
  });

  return {
    ok: true,
    clinic_id: crm.clinic_id,
    patient_id: crm.patient_id,
    conversation_id: crm.conversation_id,
    inbound_message_id: crm.inbound_message_id,
    dedupeHash: crm.dedupeHash,
    finalIntent: dec.finalIntent,
    finalPriority: dec.finalPriority,
    reply_text: patientReply,
    decision_source: dec.decisionSource,
    handoff_required: handoff,
    bridge_send_ok: send.bridge_send_ok,
    bridge_send_error: send.bridge_send_error,
    urgent_alert_sent: send.urgent_alert_sent,
    urgent_alert_error: send.urgent_alert_error,
    outbox_ids: send.outbox_ids.length ? send.outbox_ids : undefined,
    case_id,
    alert_id,
    workflow_latency_ms: Date.now() - norm.workflowStartedAt,
    dialogue_version,
  };
}

export function postIngestJobV2ToInputs(job: PostIngestJobV2): {
  crm: InboundIngestRow;
  norm: NormalizedInboundRules;
  raw: ProcessInboundInput;
  ctx: ProcessInboundContext;
} {
  const crm: InboundIngestRow = { ...job.crm };
  const norm: NormalizedInboundRules = { ...job.norm };
  const raw: ProcessInboundInput = {
    clinic_id: job.clinic_id,
    from: job.from,
    sender: job.from,
    text: job.text,
    messageId: job.norm.messageId,
    receivedAt: job.norm.receivedAt,
    execute_send: job.rawFlags.execute_send,
    send_urgent_alert: job.rawFlags.send_urgent_alert,
    enqueue_on_bridge_failure: job.rawFlags.enqueue_on_bridge_failure,
  };
  const ctx: ProcessInboundContext = { correlationId: job.correlationId };
  return { crm, norm, raw, ctx };
}

export async function processInboundPostIngestFromDeferredJob(
  pool: Pool,
  job: PostIngestJobV2,
): Promise<ProcessInboundResult> {
  const { crm, norm, raw, ctx } = postIngestJobV2ToInputs(job);
  return processInboundPostIngest(pool, crm, norm, raw, ctx);
}

async function buildPostIngestDeferredJobV2(
  pool: Pool,
  crm: InboundIngestRow,
  norm: NormalizedInboundRules,
  raw: ProcessInboundInput,
  ctx?: ProcessInboundContext,
): Promise<PostIngestJobV2> {
  let flowStep = "idle";
  const cached = await getConvContextFromCache(crm.clinic_id, crm.conversation_id);
  if (cached) {
    const d = parseDialogueState(cached.dialogue_state);
    flowStep = d.flow_step;
  }
  let dialogue_version_snapshot: number | undefined;
  try {
    const vRow = await pool.query(`SELECT dialogue_version FROM conversations WHERE id = $1`, [crm.conversation_id]);
    const v = Number(vRow.rows[0]?.dialogue_version);
    dialogue_version_snapshot = Number.isFinite(v) ? v : undefined;
  } catch {
    dialogue_version_snapshot = undefined;
  }
  const basePriority = queuePriorityFromNorm(norm.ruleIntent);
  const priority = queuePriorityWithSla(crm.clinic_id, basePriority);
  const lane = inferPostIngestLane({
    ruleIntent: norm.ruleIntent,
    textLength: (norm.text || "").length,
    flowStep,
  });
  return createPostIngestJobV2({
    conversation_id: crm.conversation_id,
    clinic_id: crm.clinic_id,
    patient_id: crm.patient_id,
    inbound_message_id: crm.inbound_message_id,
    dedupeHash: crm.dedupeHash,
    from: crm.from,
    text: crm.text,
    crm: { ...crm },
    norm: { ...norm },
    rawFlags: {
      execute_send: raw.execute_send,
      send_urgent_alert: raw.send_urgent_alert,
      enqueue_on_bridge_failure: raw.enqueue_on_bridge_failure,
    },
    correlationId: ctx?.correlationId,
    priority,
    lane,
    ...(dialogue_version_snapshot !== undefined ? { dialogue_version_snapshot } : {}),
  });
}

export async function processInboundMessage(
  pool: Pool,
  raw: ProcessInboundInput,
  ctx?: ProcessInboundContext,
): Promise<ProcessInboundResult> {
  const norm = normalizeInboundRules(raw);
  if (!norm.from) {
    return { ok: false, error: "missing_sender" };
  }

  // Dynamic clinic_id resolution via whatsapp_inbound_routes (precedence: existing
  // conversation binding > inbound route hub_clinic_id > rule-based fallback).
  // Mutates `norm.clinic_id` and surfaces `routeAllowedClinicIds` on ctx for the FSM.
  let effectiveCtx: ProcessInboundContext | undefined = ctx;
  try {
    const rctx = await resolveInboundRouteContext(pool, norm);
    if (Number.isFinite(rctx.clinic_id) && rctx.clinic_id > 0) {
      norm.clinic_id = rctx.clinic_id;
    }
    if (Array.isArray(rctx.allowed_clinic_ids) && rctx.allowed_clinic_ids.length) {
      const allowed = rctx.allowed_clinic_ids.filter((n) => Number.isFinite(n) && n > 0);
      effectiveCtx = { ...(ctx || {}), routeAllowedClinicIds: allowed };
    }
  } catch {
    /* swallow — keep rule-based clinic_id */
  }

  const senderLock = await acquireInboundPatientLock(norm.clinic_id, norm.from);
  if (!senderLock.acquired) {
    void pushDeferredInboundJob(raw as unknown as Record<string, unknown>).catch(() => undefined);
    incProductMetric("process_inbound_lock_contended_total");
    incProductMetric("process_inbound_queued_total");
    return {
      ok: true,
      duplicate: false,
      queued: true,
      defer_reason: "lock_contended",
      clinic_id: norm.clinic_id,
      reply_text: "",
      bridge_send_ok: true,
      decision_source: "inbound_sender_lock_contended",
      workflow_latency_ms: Date.now() - norm.workflowStartedAt,
    };
  }

  let crm: InboundIngestRow;
  try {
    const ingest: InboundIngestInput = {
      clinic_id: norm.clinic_id,
      from: norm.from,
      text: norm.text,
      messageId: norm.messageId,
      dedupeHash: norm.dedupeHash,
      ruleIntent: norm.ruleIntent,
      rulePriority: norm.rulePriority,
      ruleHandoff: norm.ruleHandoff,
      fallbackReply: norm.fallbackReply,
      outsideHours: norm.outsideHours,
      receivedAt: norm.receivedAt,
      alertTo: norm.alertTo,
      workflowStartedAt: norm.workflowStartedAt,
      messageSource: "process_inbound",
    };
    crm = await crmUpsertInbound(pool, ingest);
  } finally {
    await senderLock.release();
  }

  if (!crm.is_duplicate && ctx?.correlationId) {
    const cid = ctx.correlationId;
    const preview = (norm.text || "").slice(0, 200);
    const event_id = computeInboundEventId({
      clinic_id: crm.clinic_id,
      conversation_id: crm.conversation_id,
      dedupe_hash: crm.dedupeHash,
      inbound_message_id: crm.inbound_message_id,
      message_id: norm.messageId,
    });
    const ev = inboundMessageRecordedSchema.safeParse({
      type: "InboundMessageRecorded",
      version: 1,
      event_id,
      occurred_at: new Date().toISOString(),
      correlation_id: cid,
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      conversation_id: crm.conversation_id,
      inbound_message_id: crm.inbound_message_id,
      dedupe_hash: crm.dedupeHash,
      text_preview: preview,
    });
    if (ev.success) {
      void publishInboundMessageRecorded(ev.data).catch(() => undefined);
      const domainInput = {
        clinic_id: crm.clinic_id,
        conversation_id: crm.conversation_id,
        event_type: "InboundMessageRecorded",
        payload: ev.data as unknown as Record<string, unknown>,
        correlation_id: cid,
      };
      void maybeEnqueueDomainEventAppend(domainInput).then((buf) => {
        if (!buf) void appendDomainEvent(pool, domainInput).catch(() => undefined);
      });
    }
  }

  if (crm.is_duplicate) {
    return {
      ok: true,
      duplicate: true,
      bridge_send_ok: true,
      reply_text: "",
      finalIntent: "",
      decision_source: "duplicate_skip",
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      conversation_id: crm.conversation_id,
      inbound_message_id: crm.inbound_message_id,
      dedupeHash: crm.dedupeHash,
      workflow_latency_ms: crm.workflow_latency_ms,
    };
  }

  const convLock = await acquireConversationInboundLock(crm.conversation_id);
  if (!convLock.acquired) {
    const job = await buildPostIngestDeferredJobV2(pool, crm, norm, raw, effectiveCtx);
    const enq = await enqueuePostIngestDeferredV2Job(job);
    if (!enq) {
      incProductMetric("process_inbound_post_ingest_degraded_inline_total");
      return processInboundPostIngest(pool, crm, norm, raw, effectiveCtx);
    }
    incProductMetric("process_inbound_conversation_lock_contended_total");
    incProductMetric("process_inbound_queued_total");
    return {
      ok: true,
      duplicate: false,
      queued: true,
      defer_reason: "conversation_lock_contended",
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      conversation_id: crm.conversation_id,
      inbound_message_id: crm.inbound_message_id,
      dedupeHash: crm.dedupeHash,
      reply_text: "",
      bridge_send_ok: true,
      decision_source: "inbound_conversation_lock_contended",
      workflow_latency_ms: Date.now() - norm.workflowStartedAt,
    };
  }

  try {
    return await processInboundPostIngest(pool, crm, norm, raw, effectiveCtx);
  } finally {
    await convLock.release();
  }
}
