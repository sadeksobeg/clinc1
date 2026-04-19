import type { Pool, PoolClient } from "pg";
import { crmUpsertInbound, type InboundIngestInput } from "@/lib/crm/inboundIngest";
import { publishInboundMessageRecorded } from "@/lib/events/redisPublish";
import { inboundMessageRecordedSchema } from "@/lib/events/inboundMessageRecorded";
import { getDefaultMessagingAdapter } from "@/lib/messaging/WhatsAppWebAdapter";
import { appendDomainEvent } from "@/lib/domain/domainEvents";
import { incProductMetric } from "@/lib/observability/productMetrics";
import { enqueueCoreOutbox } from "@/lib/outbox/coreOutbox";
import { sendPatientWhatsApp } from "@/lib/whatsapp/patientOutbound";
import { interpretInboundText } from "@/lib/scheduling/interpret";
import { normalizeInboundRules } from "./normalizeInbound";
import { parseDialogueState } from "./dialogueParse";
import { startBookingDialogueFlow, tryConsumeBookingDialogueTurn } from "./bookingDialogueFlow";
import { runSchedulingDecision, type SchedulingDecision } from "./schedulingDecision";

export type ProcessInboundContext = {
  correlationId?: string;
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
};

function casePriorityFrom(finalPriority: number): string {
  if (finalPriority === 1) return "high";
  if (finalPriority <= 3) return "normal";
  return "low";
}

function needsHandoff(dec: SchedulingDecision): boolean {
  return Boolean(dec.handoffRequired || dec.finalIntent === "URGENT" || Number(dec.finalPriority) === 1);
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
    const sr = await sendPatientWhatsApp({
      to: args.from,
      text: patientText,
      context: "inbound_sync_reply",
      correlationId: args.correlationId,
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

export async function processInboundMessage(
  pool: Pool,
  raw: ProcessInboundInput,
  ctx?: ProcessInboundContext,
): Promise<ProcessInboundResult> {
  const execute_send = raw.execute_send !== false;
  const send_urgent_alert = raw.send_urgent_alert !== false;
  const enqueue_on_bridge_failure = raw.enqueue_on_bridge_failure !== false;

  const norm = normalizeInboundRules(raw);
  if (!norm.from) {
    return { ok: false, error: "missing_sender" };
  }

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

  const crm = await crmUpsertInbound(pool, ingest);

  if (!crm.is_duplicate && ctx?.correlationId) {
    const cid = ctx.correlationId;
    const preview = (norm.text || "").slice(0, 200);
    const ev = inboundMessageRecordedSchema.safeParse({
      type: "InboundMessageRecorded",
      version: 1,
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
      void appendDomainEvent(pool, {
        clinic_id: crm.clinic_id,
        conversation_id: crm.conversation_id,
        event_type: "InboundMessageRecorded",
        payload: ev.data as unknown as Record<string, unknown>,
        correlation_id: cid,
      }).catch(() => undefined);
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

  const convRow = await pool.query(`SELECT dialogue_state, routing FROM conversations WHERE id = $1`, [
    crm.conversation_id,
  ]);
  const dialogue = parseDialogueState(convRow.rows[0]?.dialogue_state);
  const routing = (convRow.rows[0]?.routing as Record<string, unknown>) || {};

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

  const int = await interpretInboundText(crm.text);

  if (int.intent === "urgent") {
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
    const handoff = needsHandoff(dec);
    const patientReply = handoff
      ? "تم تحويل رسالتك للفريق المختص وسيتم التواصل معك بأسرع وقت."
      : dec.finalReply;
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

  const handoff = needsHandoff(dec);
  const patientReply = handoff
    ? "تم تحويل رسالتك للفريق المختص وسيتم التواصل معك بأسرع وقت."
    : dec.finalReply;
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
