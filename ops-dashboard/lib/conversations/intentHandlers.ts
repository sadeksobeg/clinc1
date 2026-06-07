import type { Pool } from "pg";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";
import { setConversationHandoffPending } from "@/lib/ai/AIModelAdapter";
import { EXCLUDE_DEMO_DOCTOR_SQL } from "@/lib/scheduling/excludeDemoDoctors";
import { staffCancelAppointment } from "@/lib/scheduling/appointmentService";
import { incProductMetric } from "@/lib/observability/productMetrics";
import type { NormalizedInboundRules } from "./normalizeInbound";
import {
  normalizeArabicMessage,
  normalizedToInterpretResult,
  type NormalizedMessage,
  type MessageIntent,
} from "./messageNormalizer";
import { matchDoctorByName } from "./doctorNameMatch";
import { buildPricingReplyTurn } from "./mainMenuFlow";
import { startBookingDialogueFlow, tryConsumeBookingDialogueTurn, type ConsumedBookingTurn } from "./bookingDialogueFlow";
import { buildMainMenuResetTurn, dialogueStateClearedMerge } from "./dialogueSessionReset";
import { confusedRecoveryMenu, welcomeMainMenu } from "./patientCopy";
import { formatDateTimeAr } from "./whatsappTime";
import { releaseClinicLock } from "./clinicRoutingGuard";
import type { StoredDialogueState } from "./dialogueTypes";
import { DateTime } from "luxon";

export type IntentHandlerContext = {
  pool: Pool;
  crm: InboundIngestRow;
  norm: NormalizedInboundRules;
  dialogue: StoredDialogueState;
  routing: Record<string, unknown>;
  message: NormalizedMessage;
  clinicId: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

type VisitTypeRow = { name: string; price: string; currency: string; specialty_code: string | null };

async function loadVisitTypes(pool: Pool, clinicId: number, specialty?: string): Promise<VisitTypeRow[]> {
  try {
    const r = await pool.query<VisitTypeRow>(
      `SELECT name, price::text, currency, specialty_code
       FROM visit_types
       WHERE clinic_id = $1 AND is_active = TRUE
         AND ($2::text IS NULL OR specialty_code IS NULL OR lower(specialty_code) = lower($2::text))
       ORDER BY sort_order ASC, price ASC
       LIMIT 20`,
      [clinicId, specialty || null],
    );
    if (r.rows.length) return r.rows;
  } catch {
    /* table may not exist pre-migration */
  }
  try {
    const meta = await pool.query(`SELECT metadata FROM clinics WHERE id = $1`, [clinicId]);
    const pricing = (meta.rows[0]?.metadata as Record<string, unknown> | undefined)?.pricing;
    if (Array.isArray(pricing)) {
      return pricing
        .map((row) => {
          const o = row as Record<string, unknown>;
          return {
            name: String(o.name || "كشف"),
            price: String(o.price ?? ""),
            currency: String(o.currency || "SYP"),
            specialty_code: o.specialty_code ? String(o.specialty_code) : null,
          };
        })
        .filter((x) => x.price.length > 0);
    }
  } catch {
    /* ignore */
  }
  return [];
}

async function loadActiveDoctors(
  pool: Pool,
  clinicId: number,
  specialty?: string,
): Promise<Array<{ id: number; display_name: string; specialty: string }>> {
  const r = await pool.query(
    `SELECT d.id, d.display_name, d.specialty
     FROM doctors d
     WHERE d.clinic_id = $1 AND d.deleted_at IS NULL AND d.is_active IS NOT FALSE
       ${EXCLUDE_DEMO_DOCTOR_SQL}
       AND ($2::text IS NULL OR lower(d.specialty) LIKE '%' || lower($2::text) || '%')
     ORDER BY d.display_name
     LIMIT 30`,
    [clinicId, specialty || null],
  );
  return r.rows as Array<{ id: number; display_name: string; specialty: string }>;
}

async function findUpcomingAppointment(
  pool: Pool,
  clinicId: number,
  patientId: number,
): Promise<{ id: number; starts_at: string; doctor_name: string } | null> {
  const r = await pool.query(
    `SELECT a.id, a.starts_at, d.display_name AS doctor_name
     FROM appointments a
     LEFT JOIN doctors d ON d.id = a.doctor_id
     WHERE a.clinic_id = $1 AND a.patient_id = $2 AND a.deleted_at IS NULL
       AND a.starts_at > NOW()
       AND a.status NOT IN ('cancelled', 'completed', 'no_show')
     ORDER BY a.starts_at ASC
     LIMIT 1`,
    [clinicId, patientId],
  );
  const row = r.rows[0] as { id: number; starts_at: string; doctor_name: string } | undefined;
  return row ?? null;
}

export async function handleEmergency(ctx: IntentHandlerContext): Promise<ConsumedBookingTurn> {
  incProductMetric("rules_engine_routed_total");
  return {
    reply_text:
      "تم تسجيل حالتك كأولوية. إذا كانت الحالة خطيرة يرجى التوجه للطوارئ فوراً. سيتواصل معك الفريق قريباً.",
    finalIntent: "URGENT",
    finalPriority: 1,
    decision_source: "rules_emergency",
    handoff_required: true,
    dialogueMerge: dialogueStateClearedMerge(),
  };
}

export async function handlePriceInquiry(ctx: IntentHandlerContext): Promise<ConsumedBookingTurn> {
  incProductMetric("rules_engine_routed_total");
  const rows = await loadVisitTypes(ctx.pool, ctx.clinicId, ctx.message.entities.specialty);
  if (rows.length) {
    const lines = rows.map((r) => `• ${r.name}: ${r.price} ${r.currency}`);
    return {
      reply_text: `أسعار الخدمات:\n${lines.join("\n")}\n\n${welcomeMainMenu()}`,
      finalIntent: "PRICING",
      finalPriority: 3,
      decision_source: "rules_price_visit_types",
      handoff_required: false,
      dialogueMerge: dialogueStateClearedMerge(),
    };
  }
  return buildPricingReplyTurn();
}

export async function handleDoctorRequest(ctx: IntentHandlerContext): Promise<ConsumedBookingTurn | null> {
  incProductMetric("rules_engine_routed_total");
  const doctors = await loadActiveDoctors(ctx.pool, ctx.clinicId, ctx.message.entities.specialty);
  if (!doctors.length) {
    return startBookingDialogueFlow(
      ctx.pool,
      { ...ctx.crm, clinic_id: ctx.clinicId },
      ctx.norm,
      ctx.routing,
      normalizedToInterpretResult(ctx.message),
      ctx.norm.text,
    );
  }
  const hint = ctx.message.entities.doctorName;
  if (hint) {
    const match = matchDoctorByName(hint, doctors);
    if (match.kind === "ambiguous") {
      const names = match.candidates.map((d) => d.display_name).join("\n• ");
      return {
        reply_text: `هل تقصد:\n• ${names}\n\nأرسل اسم الطبيب أو رقمه من القائمة.`,
        finalIntent: "BOOKING",
        finalPriority: 2,
        decision_source: "rules_doctor_disambiguate",
        handoff_required: false,
        dialogueMerge: { flow_step: "idle", consecutive_unparsed: 0, updated_at: nowIso() },
      };
    }
    if (match.kind === "exact" || match.kind === "fuzzy") {
      const int = normalizedToInterpretResult({
        ...ctx.message,
        entities: { ...ctx.message.entities, doctorName: match.doctor.display_name },
      });
      int.doctor_hint = match.doctor.display_name;
      return startBookingDialogueFlow(
        ctx.pool,
        { ...ctx.crm, clinic_id: ctx.clinicId },
        ctx.norm,
        { ...ctx.routing, selected_doctor_id: match.doctor.id },
        int,
        ctx.norm.text,
      );
    }
  }
  return startBookingDialogueFlow(
    ctx.pool,
    { ...ctx.crm, clinic_id: ctx.clinicId },
    ctx.norm,
    ctx.routing,
    normalizedToInterpretResult(ctx.message),
    ctx.norm.text,
  );
}

export async function handleBookingRequest(ctx: IntentHandlerContext): Promise<ConsumedBookingTurn> {
  incProductMetric("rules_engine_routed_total");
  return startBookingDialogueFlow(
    ctx.pool,
    { ...ctx.crm, clinic_id: ctx.clinicId },
    ctx.norm,
    ctx.routing,
    normalizedToInterpretResult(ctx.message),
    ctx.norm.text,
  );
}

export async function handleAffirmation(ctx: IntentHandlerContext): Promise<ConsumedBookingTurn | null> {
  const step = ctx.dialogue.flow_step;
  if (step === "awaiting_cancel_confirm" && ctx.dialogue.pending_cancel_appointment_id) {
    const apptId = ctx.dialogue.pending_cancel_appointment_id;
    const res = await staffCancelAppointment(ctx.pool, { appointmentId: apptId, clinicId: ctx.clinicId });
    if (res.ok) {
      await releaseClinicLock(ctx.pool, ctx.crm.conversation_id).catch(() => undefined);
      return {
        reply_text: "تم إلغاء موعدك. إذا احتجت موعداً جديداً أرسل «حجز» أو 1.",
        finalIntent: "CANCEL",
        finalPriority: 2,
        decision_source: "rules_cancel_confirmed",
        handoff_required: false,
        dialogueMerge: dialogueStateClearedMerge(),
      };
    }
  }
  const consumed = await tryConsumeBookingDialogueTurn(ctx.pool, {
    crm: ctx.crm,
    norm: { ...ctx.norm, text: "1" },
    dialogue: ctx.dialogue,
    routing: ctx.routing,
  });
  if (consumed) {
    incProductMetric("rules_engine_routed_total");
    return consumed;
  }
  if (["slot_offer", "awaiting_confirm", "choose_doctor", "choose_clinic"].includes(step)) {
    return null;
  }
  incProductMetric("rules_engine_routed_total");
  return {
    reply_text: `ما الذي تريد تأكيده؟\n\n${welcomeMainMenu()}`,
    finalIntent: "GENERAL",
    finalPriority: 4,
    decision_source: "rules_affirmation_unclear",
    handoff_required: false,
    dialogueMerge: { flow_step: "awaiting_main_menu", pending_kind: "main_menu", updated_at: nowIso() },
  };
}

export async function handleNegation(ctx: IntentHandlerContext): Promise<ConsumedBookingTurn | null> {
  const step = ctx.dialogue.flow_step;
  if (step === "awaiting_cancel_confirm") {
    return {
      reply_text: "حسناً، لم نلغِ الموعد. إذا احتجت مساعدة أخبرنا.",
      finalIntent: "GENERAL",
      finalPriority: 4,
      decision_source: "rules_cancel_declined",
      handoff_required: false,
      dialogueMerge: dialogueStateClearedMerge(),
    };
  }
  if (step === "awaiting_confirm" || step === "slot_offer") {
    return {
      reply_text: "تم الإلغاء. هل تريد وقتاً آخر؟ أرسل «مواعيد أخرى» أو اختر من القائمة.",
      finalIntent: "BOOKING",
      finalPriority: 3,
      decision_source: "rules_negation_slot",
      handoff_required: false,
      dialogueMerge: {
        ...ctx.dialogue,
        flow_step: "slot_offer",
        consecutive_unparsed: 0,
        updated_at: nowIso(),
      },
    };
  }
  incProductMetric("rules_engine_routed_total");
  return {
    reply_text: "حسناً! إذا احتجت مساعدة أخبرني.\n\n" + welcomeMainMenu(),
    finalIntent: "GENERAL",
    finalPriority: 4,
    decision_source: "rules_negation_general",
    handoff_required: false,
    dialogueMerge: dialogueStateClearedMerge(),
  };
}

export async function handleCancelAppointment(ctx: IntentHandlerContext): Promise<ConsumedBookingTurn> {
  incProductMetric("rules_engine_routed_total");
  const appt = await findUpcomingAppointment(ctx.pool, ctx.clinicId, ctx.crm.patient_id);
  if (!appt) {
    return {
      reply_text: "لا يوجد لديك موعد قادم في هذه العيادة.\n\n" + welcomeMainMenu(),
      finalIntent: "CANCEL",
      finalPriority: 3,
      decision_source: "rules_cancel_none",
      handoff_required: false,
      dialogueMerge: dialogueStateClearedMerge(),
    };
  }
  const tzR = await ctx.pool.query(`SELECT timezone FROM clinics WHERE id = $1`, [ctx.clinicId]);
  const tz = (tzR.rows[0]?.timezone as string) || "Asia/Amman";
  const when = formatDateTimeAr(DateTime.fromISO(appt.starts_at, { zone: "utc" }).setZone(tz));
  return {
    reply_text: `موعدك ${when} مع ${appt.doctor_name || "الطبيب"}.\nهل تريد إلغاءه؟\n1) نعم\n2) لا`,
    finalIntent: "CANCEL",
    finalPriority: 2,
    decision_source: "rules_cancel_confirm_prompt",
    handoff_required: false,
    dialogueMerge: {
      flow_step: "awaiting_cancel_confirm",
      pending_cancel_appointment_id: appt.id,
      pending_kind: null,
      consecutive_unparsed: 0,
      updated_at: nowIso(),
    },
  };
}

export function handleGreeting(ctx: IntentHandlerContext, isFirstStyle: boolean): ConsumedBookingTurn {
  incProductMetric("rules_engine_routed_total");
  if (isFirstStyle) return buildMainMenuResetTurn();
  return {
    reply_text: "أهلاً مجدداً! كيف يمكنني مساعدتك؟\n\n" + welcomeMainMenu(),
    finalIntent: "GENERAL",
    finalPriority: 4,
    decision_source: "rules_greeting_returning",
    handoff_required: false,
    dialogueMerge: { flow_step: "awaiting_main_menu", pending_kind: "main_menu", updated_at: nowIso() },
  };
}

export function handleOutOfContext(ctx: IntentHandlerContext): ConsumedBookingTurn {
  incProductMetric("rules_engine_routed_total");
  return {
    reply_text:
      "أنا مساعد العيادة، يمكنني مساعدتك في حجز المواعيد والاستفسارات الطبية.\n\n" + welcomeMainMenu(),
    finalIntent: "GENERAL",
    finalPriority: 4,
    decision_source: "rules_out_of_context",
    handoff_required: false,
    dialogueMerge: dialogueStateClearedMerge(),
  };
}

export async function handleUnknown(ctx: IntentHandlerContext): Promise<ConsumedBookingTurn | "handoff"> {
  incProductMetric("rules_engine_unknown_total");
  const unparsed = (ctx.dialogue.consecutive_unparsed ?? 0) + 1;
  if (unparsed >= 2 || ctx.message.confidence < 0.3) {
    await setConversationHandoffPending(ctx.pool, ctx.crm.conversation_id, ctx.crm.clinic_id, "rules_unknown_twice");
    incProductMetric("rules_engine_handoff_total");
    return "handoff";
  }
  return {
    reply_text: confusedRecoveryMenu(),
    finalIntent: "GENERAL",
    finalPriority: 4,
    decision_source: "rules_unknown_reprompt",
    handoff_required: false,
    dialogueMerge: {
      flow_step: "awaiting_main_menu",
      pending_kind: "main_menu",
      consecutive_unparsed: unparsed,
      updated_at: nowIso(),
    },
  };
}

export async function dispatchIntentHandler(
  ctx: IntentHandlerContext,
): Promise<ConsumedBookingTurn | "handoff" | null> {
  switch (ctx.message.intent) {
    case "EMERGENCY":
      return handleEmergency(ctx);
    case "PRICE_INQUIRY":
      return handlePriceInquiry(ctx);
    case "DOCTOR_REQUEST":
      return handleDoctorRequest(ctx);
    case "BOOKING_REQUEST":
    case "TIME_INQUIRY":
    case "RESCHEDULE":
      return handleBookingRequest(ctx);
    case "AFFIRMATION":
      return handleAffirmation(ctx);
    case "NEGATION":
      return handleNegation(ctx);
    case "CANCEL_APPOINTMENT":
      return handleCancelAppointment(ctx);
    case "GREETING":
      return handleGreeting(ctx, ctx.dialogue.flow_step === "idle");
    case "THANKS":
      return {
        reply_text: "العفو! " + welcomeMainMenu(),
        finalIntent: "GENERAL",
        finalPriority: 4,
        decision_source: "rules_thanks",
        handoff_required: false,
        dialogueMerge: dialogueStateClearedMerge(),
      };
    case "OUT_OF_CONTEXT":
      return handleOutOfContext(ctx);
    case "UNKNOWN":
    default:
      return handleUnknown(ctx);
  }
}

export { normalizeArabicMessage, type NormalizedMessage, type MessageIntent };
