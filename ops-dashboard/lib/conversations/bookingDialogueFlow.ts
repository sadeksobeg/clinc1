import { DateTime } from "luxon";
import type { Pool } from "pg";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";
import { confirmAppointment } from "@/lib/scheduling/appointmentService";
import {
  listClinics,
  listSpecialtiesForClinics,
  setConversationSelectedClinicTx,
  setConversationSelectedDoctor,
  setConversationSelectedSpecialty,
  type SpecialtyForRouting,
} from "@/lib/scheduling/routingActions";
import { EXCLUDE_DEMO_DOCTOR_SQL } from "@/lib/scheduling/excludeDemoDoctors";
import { explainNoSlots, findNextSlots } from "@/lib/scheduling/slotService";
import type { InterpretResult } from "@/lib/scheduling/types";
import { getClinicPublicOpenStatus } from "@/lib/scheduling/clinicPublicHours";
import { extractBookingEntities, logAiExtract, pickClinicIndexByHint, pickDoctorIndexByHint } from "@/lib/ai/bookingEntityExtract";
import { findDoctorIdBySpecialtyOrNameToken, specialtySearchTokenFromText } from "@/lib/ai/doctorMatch";
import { incProductMetric } from "@/lib/observability/productMetrics";
import { fetchPatientConversationMemory, upsertPatientConversationMemory } from "@/lib/conversations/patientConversationMemory";
import { formatClinicTodayHoursAr } from "@/lib/scheduling/clinicPublicHours";
import type { NormalizedInboundRules } from "./normalizeInbound";
import { parseListSelectionWithOrdinals1Based, parseTimeOfDayFromText } from "./dialogueParse";
import { formatDateTimeAr } from "./whatsappTime";
import { buildMainMenuResetTurn, dialogueStateClearedMerge, isDialogueStateStale, isSessionResetIntent } from "./dialogueSessionReset";
import {
  askPatientFullName,
  chooseClinicIntro,
  chooseDoctorIntro,
  chooseSpecialtyIntro,
  confusedRecoveryMenu,
  handoffToSecretary,
  noDoctorsForSpecialty,
  repromptChooseClinic,
  repromptChooseDoctor,
  repromptChooseSlot,
  repromptSpecialty,
  singleSlotConfirmLine,
  slotListIntro,
  welcomeMainMenu,
} from "./patientCopy";
import { detectTimePreference, filterSlotsByTimePreference, type TimePreference } from "./timePreference";
import type {
  DialogueTimePref,
  PendingClinicPick,
  PendingDoctorPick,
  PendingSlotOffer,
  PendingSpecialtyPick,
  StoredDialogueState,
} from "./dialogueTypes";

export type ConsumedBookingTurn = {
  reply_text: string;
  finalIntent: string;
  finalPriority: number;
  decision_source: string;
  handoff_required: boolean;
  dialogueMerge: Record<string, unknown>;
  /** Slot confirm: runs confirm + dialogue + outbound in one transaction. */
  postProcess?: (pool: Pool) => Promise<{
    patient_reply: string;
    failed?: boolean;
    appointment_id?: number;
    duplicate?: boolean;
  }>;
  /** When set, `processInbound` inserts an `alerts` row if `alertTo` is configured. */
  failsafeAlert?: { alert_type: string; notes: string };
};

const FAILSAFE_UNPARSED_THRESHOLD = 3;

function nowIso(): string {
  return new Date().toISOString();
}

function routingClinicIdsFromEnv(): number[] {
  const raw = (process.env.WHATSAPP_ROUTING_CLINIC_IDS || "").trim();
  if (!raw) return [];
  return raw.split(/[,;\s]+/).map((s) => Number.parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
}

async function patientHasDisplayName(pool: Pool, patientId: number): Promise<boolean> {
  const r = await pool.query(`SELECT display_name FROM patients WHERE id = $1`, [patientId]);
  const s = (r.rows[0]?.display_name as string) || "";
  return s.trim().length >= 2;
}

function selectedClinicFromRouting(routing: Record<string, unknown>): number | null {
  const v = routing.selected_clinic_id;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function dialogueTimePrefFromStored(d: StoredDialogueState): TimePreference {
  const x = d.time_pref;
  if (x === "morning" || x === "afternoon" || x === "any") return x;
  return null;
}

function timePrefForMerge(text: string): DialogueTimePref | null {
  const det = detectTimePreference(text);
  if (det === "morning" || det === "afternoon" || det === "any") return det;
  return null;
}

const INTERACTIVE_STEPS = new Set([
  "slot_offer",
  "choose_doctor",
  "choose_clinic",
  "awaiting_specialty",
  "awaiting_display_name",
  "awaiting_confirm",
]);

function unparsedInteractiveTurn(
  d: StoredDialogueState,
  specificReprompt: string,
  inboundText?: string,
): ConsumedBookingTurn {
  if (inboundText && isSessionResetIntent(inboundText)) {
    return buildMainMenuResetTurn();
  }
  if (INTERACTIVE_STEPS.has(d.flow_step) && (d.consecutive_unparsed ?? 0) >= 1) {
    return buildMainMenuResetTurn();
  }
  const prev = d.consecutive_unparsed ?? 0;
  const next = prev + 1;
  if (next >= FAILSAFE_UNPARSED_THRESHOLD) {
    incProductMetric("ai_handoff_total");
    return {
      reply_text: handoffToSecretary(),
      finalIntent: "BOOKING",
      finalPriority: 2,
      decision_source: "dialogue_failsafe_handoff",
      handoff_required: true,
      dialogueMerge: {
        flow_step: "idle",
        pending_kind: null,
        pending_slots: [],
        pending_doctors: [],
        pending_clinics: [],
        consecutive_unparsed: 0,
        updated_at: nowIso(),
      },
      failsafeAlert: {
        alert_type: "DIALOGUE_FAILSAFE",
        notes: "تجاوز عدد الردود غير المفهومة في حوار الحجز؛ تم إيقاف الـ FSM وتفويض متابعة بشرية.",
      },
    };
  }
  incProductMetric("ai_confusion_total");
  if (INTERACTIVE_STEPS.has(d.flow_step)) {
    return {
      reply_text: `${welcomeMainMenu()}\n\n${specificReprompt}`,
      finalIntent: "BOOKING",
      finalPriority: 2,
      decision_source: "dialogue_reprompt_menu_hint",
      handoff_required: false,
      dialogueMerge: { ...dialogueStateClearedMerge(), consecutive_unparsed: next },
    };
  }
  return {
    reply_text: `${confusedRecoveryMenu()}\n\n${specificReprompt}`,
    finalIntent: "BOOKING",
    finalPriority: 2,
    decision_source: "dialogue_reprompt",
    handoff_required: false,
    dialogueMerge: { consecutive_unparsed: next, updated_at: nowIso() },
  };
}

async function loadDoctors(
  pool: Pool,
  clinicId: number,
  specialty: string | null | undefined,
): Promise<PendingDoctorPick[]> {
  const r = await pool.query(
    `SELECT d.id, d.display_name, d.specialty
     FROM doctors d
     WHERE d.clinic_id = $1 AND d.deleted_at IS NULL AND d.is_active = TRUE
       AND ($2::text IS NULL OR lower(d.specialty) = lower($2::text))
       ${EXCLUDE_DEMO_DOCTOR_SQL}
     ORDER BY d.id ASC
     LIMIT 12`,
    [clinicId, specialty || null],
  );
  return (r.rows as { id: number; display_name: string; specialty: string }[]).map((row, i) => ({
    ix: i + 1,
    doctor_id: row.id,
    display_name: row.display_name,
    specialty: row.specialty,
  }));
}

/**
 * Cross-clinic doctor list filtered by specialty_id (preferred when patient picks
 * a specialty from the menu — covers all clinics enrolled in this WhatsApp number).
 */
async function loadDoctorsBySpecialtyId(
  pool: Pool,
  clinicIds: number[],
  specialtyId: number,
): Promise<PendingDoctorPick[]> {
  if (!clinicIds.length) return [];
  const r = await pool.query(
    `SELECT d.id, d.display_name, d.specialty, d.clinic_id
       FROM doctors d
       JOIN doctor_specialties ds ON ds.doctor_id = d.id AND ds.specialty_id = $2
      WHERE d.clinic_id = ANY($1::bigint[])
        AND d.deleted_at IS NULL
        AND d.is_active = TRUE
        ${EXCLUDE_DEMO_DOCTOR_SQL}
      ORDER BY ds.is_primary DESC, d.id ASC
      LIMIT 12`,
    [clinicIds, specialtyId],
  );
  return (r.rows as { id: number; display_name: string; specialty: string }[]).map((row, i) => ({
    ix: i + 1,
    doctor_id: row.id,
    display_name: row.display_name,
    specialty: row.specialty,
  }));
}

function buildSpecialtyPicks(rows: SpecialtyForRouting[]): PendingSpecialtyPick[] {
  return rows.slice(0, 12).map((s, i) => ({
    ix: i + 1,
    specialty_id: s.id,
    code: s.code,
    label_ar: s.label_ar,
  }));
}

function routingClinicIdsFromInputs(
  routing: Record<string, unknown>,
  envIds: number[],
  fallback: number,
): number[] {
  const allowed = Array.isArray(routing.allowed_clinic_ids)
    ? (routing.allowed_clinic_ids as unknown[]).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  if (allowed.length) return allowed;
  if (envIds.length) return envIds;
  return [fallback];
}

async function commitSelectedClinic(pool: Pool, conversationId: number, clinicId: number): Promise<void> {
  const lk = await pool.connect();
  try {
    await lk.query("BEGIN");
    await lk.query(`SELECT id FROM conversations WHERE id = $1 FOR UPDATE`, [conversationId]);
    await setConversationSelectedClinicTx(lk, conversationId, clinicId);
    await lk.query("COMMIT");
  } catch (e) {
    await lk.query("ROLLBACK");
    throw e;
  } finally {
    lk.release();
  }
}

/** Shared path after a clinic row is chosen (list reply or AI clinic_hint). */
async function continueBookingAfterClinicChosen(
  pool: Pool,
  crm: InboundIngestRow,
  chosen: PendingClinicPick,
  lastSpecialty: string | null | undefined,
  timePrefActive: TimePreference | null,
  tpMerge: DialogueTimePref | null,
): Promise<ConsumedBookingTurn> {
  const todayHours = await formatClinicTodayHoursAr(pool, chosen.clinic_id).catch(() => "");
  await commitSelectedClinic(pool, crm.conversation_id, chosen.clinic_id);
  void upsertPatientConversationMemory(pool, {
    clinic_id: crm.clinic_id,
    patient_id: crm.patient_id,
    facts_patch: { last_clinic_id: chosen.clinic_id },
  }).catch(() => undefined);
  const pn = await pool.query(`SELECT display_name FROM patients WHERE id = $1`, [crm.patient_id]);
  const hasName = !!String(pn.rows[0]?.display_name || "").trim();
  if (!hasName) {
    return {
      reply_text: `تم اختيار العيادة: ${chosen.name}.\n${todayHours ? `${todayHours}\n` : ""}${askPatientFullName()}`,
      finalIntent: "BOOKING",
      finalPriority: 2,
      decision_source: "dialogue_collect_name_after_clinic",
      handoff_required: false,
      dialogueMerge: {
        flow_step: "awaiting_display_name",
        collect_field: "display_name",
        hub_clinic_id: chosen.clinic_id,
        resume_after_name: "doctors",
        pending_kind: null,
        pending_clinics: [],
        pending_doctors: [],
        pending_slots: [],
        last_specialty: lastSpecialty ?? null,
        time_pref: tpMerge,
        consecutive_unparsed: 0,
        updated_at: nowIso(),
      },
    };
  }
  const doctors = await loadDoctors(pool, chosen.clinic_id, lastSpecialty);
  const tp = timePrefActive;
  if (doctors.length > 1) {
    const lines = doctors.map((x) => `${x.ix}) ${x.display_name} (${x.specialty})`);
    return {
      reply_text: `تم اختيار العيادة: ${chosen.name}.\n${todayHours ? `${todayHours}\n` : ""}${chooseDoctorIntro(lines.join("\n"))}`,
      finalIntent: "BOOKING",
      finalPriority: 2,
      decision_source: "dialogue_choose_doctor",
      handoff_required: false,
      dialogueMerge: {
        flow_step: "choose_doctor",
        pending_kind: "doctors",
        pending_doctors: doctors,
        pending_slots: [],
        pending_clinics: [],
        hub_clinic_id: chosen.clinic_id,
        last_specialty: lastSpecialty ?? null,
        consecutive_unparsed: 0,
        updated_at: nowIso(),
      },
    };
  }
  if (doctors.length === 1) {
    const doc = doctors[0]!;
    const so = await slotOfferPayload(pool, crm, lastSpecialty, doc.doctor_id, tp);
    return {
      reply_text: `تم اختيار العيادة: ${chosen.name}.\n${todayHours ? `${todayHours}\n` : ""}${so.reply}`,
      finalIntent: "BOOKING",
      finalPriority: 2,
      decision_source: "dialogue_slots",
      handoff_required: false,
      dialogueMerge: so.merge,
    };
  }
  return {
    reply_text: `تم اختيار العيادة: ${chosen.name}.\n${todayHours ? `${todayHours}\n` : ""}لكن لا يوجد أطباء نشطون لهذا التخصص حاليًا. يرجى التواصل مع السكرتارية.`,
    finalIntent: "BOOKING",
    finalPriority: 2,
    decision_source: "dialogue_no_doctors",
    handoff_required: false,
    dialogueMerge: {
      flow_step: "idle",
      pending_kind: null,
      pending_clinics: [],
      pending_doctors: [],
      pending_slots: [],
      consecutive_unparsed: 0,
      updated_at: nowIso(),
    },
  };
}

async function buildClinicPicks(pool: Pool, ids: number[]): Promise<PendingClinicPick[]> {
  const all = await listClinics(pool);
  const map = new Map(all.map((c) => [c.id, c]));
  const picks: PendingClinicPick[] = [];
  let ix = 1;
  for (const id of ids) {
    const row = map.get(id);
    if (row) {
      picks.push({ ix, clinic_id: row.id, name: row.name });
      ix += 1;
    }
  }
  return picks;
}

function formatSlotLines(slots: { starts_at: string; doctor_name: string }[], tz: string): string[] {
  return slots.map((s, i) => {
    const t = DateTime.fromISO(s.starts_at, { zone: "utc" }).setZone(tz);
    return `${i + 1}) ${s.doctor_name} — ${formatDateTimeAr(t)}`;
  });
}

async function slotOfferPayload(
  pool: Pool,
  crm: InboundIngestRow,
  specialty: string | null | undefined,
  doctorId: number | undefined,
  timePref: TimePreference | null,
  opts?: { page?: number; forceNextDay?: boolean },
): Promise<{ reply: string; merge: Record<string, unknown> }> {
  const page = Math.max(0, Math.floor(opts?.page ?? 0));
  let fetchLimit = 3 + page * 3;
  if (timePref === "morning" || timePref === "afternoon") fetchLimit = 36;
  else if (timePref === "any") fetchLimit = 1;

  let slots = await findNextSlots(pool, {
    clinicId: crm.clinic_id,
    specialty: specialty || undefined,
    doctorId,
    limit: fetchLimit,
    conversationId: crm.conversation_id,
  });
  const tzR = await pool.query(`SELECT timezone FROM clinics WHERE id = $1`, [crm.clinic_id]);
  const tz = (tzR.rows[0]?.timezone as string) || "Asia/Amman";

  let chosen = slots;
  if (timePref === "morning" || timePref === "afternoon") {
    const filtered = filterSlotsByTimePreference(slots, tz, timePref);
    chosen = filtered.length > 0 ? filtered.slice(0, 3) : slots.slice(0, 3);
  } else if (timePref === "any") {
    chosen = slots.slice(0, 1);
  } else {
    chosen = slots.slice(page * 3, page * 3 + 3);
  }

  if (opts?.forceNextDay && chosen.length) {
    const today = DateTime.now().setZone(tz).toISODate();
    const later = slots.filter((s) => {
      const t = DateTime.fromISO(s.starts_at, { zone: "utc" }).setZone(tz);
      return t.isValid && t.toISODate() !== today;
    });
    chosen = later.slice(0, 3);
  }

  const lines = formatSlotLines(chosen, tz);
  let reply: string;
  if (slots.length === 0) {
    const ex = await explainNoSlots(pool, {
      clinicId: crm.clinic_id,
      specialty: specialty || undefined,
      doctorId,
      conversationId: crm.conversation_id,
    });
    reply = ex.closed_message_ar;
  } else if (chosen.length === 1 && timePref === "any") {
    const s = chosen[0]!;
    const t = DateTime.fromISO(s.starts_at, { zone: "utc" }).setZone(tz);
    const whenLabel = t.isValid ? formatDateTimeAr(t) : s.starts_at;
    reply = singleSlotConfirmLine(whenLabel, s.doctor_name);
  } else {
    reply = slotListIntro(lines.join("\n"));
  }

  const pending_slots: PendingSlotOffer[] = chosen.map((s, i) => ({
    ix: i + 1,
    starts_at: s.starts_at,
    doctor_id: s.doctor_id,
    doctor_name: s.doctor_name,
  }));

  const mergeTimePref: DialogueTimePref | null =
    timePref === "morning" || timePref === "afternoon" || timePref === "any" ? timePref : null;

  const merge: Record<string, unknown> = {
    flow_step: chosen.length ? "slot_offer" : "idle",
    pending_kind: chosen.length ? "slots" : null,
    pending_slots: chosen.length ? pending_slots : [],
    pending_doctors: [],
    pending_clinics: [],
    last_specialty: specialty ?? null,
    hub_clinic_id: crm.clinic_id,
    consecutive_unparsed: 0,
    time_pref: mergeTimePref,
    slot_page: chosen.length ? page : 0,
    updated_at: nowIso(),
  };
  return { reply, merge };
}

function slotConfirmPost(
  pool: Pool,
  crm: InboundIngestRow,
  slot: PendingSlotOffer,
): ConsumedBookingTurn["postProcess"] {
  const idem = `slot_confirm:${crm.conversation_id}:${slot.starts_at}`;
  return async (p: Pool) => {
    const docR = await p.query(`SELECT clinic_id FROM doctors WHERE id = $1 AND deleted_at IS NULL`, [slot.doctor_id]);
    const confirmClinicId = Number((docR.rows[0] as { clinic_id: number } | undefined)?.clinic_id || crm.clinic_id);
    const tzR = await p.query(`SELECT timezone FROM clinics WHERE id = $1`, [confirmClinicId]);
    const tz = (tzR.rows[0]?.timezone as string) || "Asia/Amman";
    const t = DateTime.fromISO(slot.starts_at, { zone: "utc" }).setZone(tz);
    const when = t.isValid ? formatDateTimeAr(t) : slot.starts_at;
    const res = await confirmAppointment(p, {
      clinicId: confirmClinicId,
      patientId: crm.patient_id,
      doctorId: slot.doctor_id,
      startsAtIso: slot.starts_at,
      conversationId: crm.conversation_id,
      idempotencyKey: idem,
      sourceChannel: "whatsapp",
    });
    if (!res.ok) {
      const msg =
        res.code === "overlap"
          ? "عذراً، هذا الموعد لم يعد متاحاً. اختر رقماً آخر من القائمة أو أعد طلب الحجز."
          : "تعذر تأكيد الموعد. يرجى التواصل مع السكرتيرة.";
      return { patient_reply: msg, failed: true };
    }
    const replyOk = res.duplicate
      ? `موعدك مسجل مسبقاً (${when}). نراك في العيادة.`
      : `تم تأكيد حجزك (${when}) مع ${slot.doctor_name}. نراك في العيادة.`;
    await p.query(
      `UPDATE conversations
       SET dialogue_state = COALESCE(dialogue_state, '{}'::jsonb) || $1::jsonb,
           dialogue_version = dialogue_version + 1,
           state = 'ACTIVE',
           updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3`,
      [
        JSON.stringify({
          flow_step: "done",
          pending_kind: null,
          pending_slots: [],
          pending_doctors: [],
          pending_clinics: [],
          consecutive_unparsed: 0,
          updated_at: nowIso(),
        }),
        crm.conversation_id,
        crm.clinic_id,
      ],
    );
    return {
      patient_reply: replyOk,
      failed: false,
      appointment_id: res.appointment_id,
      duplicate: res.duplicate ?? false,
    };
  };
}

/**
 * When the conversation is already in a booking step, consume the patient reply.
 */
export async function tryConsumeBookingDialogueTurn(
  pool: Pool,
  args: {
    crm: InboundIngestRow;
    norm: NormalizedInboundRules;
    dialogue: StoredDialogueState;
    routing: Record<string, unknown>;
  },
): Promise<ConsumedBookingTurn | null> {
  const { crm, norm, dialogue: d } = args;
  if (isSessionResetIntent(norm.text) || isDialogueStateStale(d)) {
    return buildMainMenuResetTurn();
  }
  const step = d.flow_step;

  if (step === "awaiting_display_name" && d.collect_field === "display_name") {
    const name = norm.text.trim();
    if (name.length < 2) {
      return unparsedInteractiveTurn(d, askPatientFullName(), norm.text);
    }
    await pool.query(`UPDATE patients SET display_name = $1, updated_at = NOW() WHERE id = $2`, [
      name.slice(0, 200),
      crm.patient_id,
    ]);
    const hub = typeof d.hub_clinic_id === "number" ? d.hub_clinic_id : crm.clinic_id;
    const resume = d.resume_after_name;
    if (resume === "specialty") {
      const envIds = routingClinicIdsFromEnv();
      const clinicIds = routingClinicIdsFromInputs(args.routing, envIds, crm.clinic_id);
      const specs = await listSpecialtiesForClinics(pool, clinicIds).catch(() => []);
      if (specs.length >= 1) {
        const picks = buildSpecialtyPicks(specs);
        const lines = picks.map((s) => `${s.ix}) ${s.label_ar}`);
        return {
          reply_text: `شكراً ${name}.\n${chooseSpecialtyIntro(lines.join("\n"))}`,
          finalIntent: "BOOKING",
          finalPriority: 2,
          decision_source: "dialogue_choose_specialty_after_name",
          handoff_required: false,
          dialogueMerge: {
            flow_step: "awaiting_specialty",
            pending_kind: "specialties",
            pending_specialties: picks,
            pending_clinics: [],
            pending_doctors: [],
            pending_slots: [],
            collect_field: null,
            resume_after_name: null,
            hub_clinic_id: hub,
            consecutive_unparsed: 0,
            updated_at: nowIso(),
          },
        };
      }
    }
    if (resume === "doctors") {
      const doctors = await loadDoctors(pool, hub, d.last_specialty);
      const tp = dialogueTimePrefFromStored(d);
      if (doctors.length > 1) {
        const lines = doctors.map((x) => `${x.ix}) ${x.display_name} (${x.specialty})`);
        return {
          reply_text: `شكراً ${name}.\n${chooseDoctorIntro(lines.join("\n"))}`,
          finalIntent: "BOOKING",
          finalPriority: 2,
          decision_source: "dialogue_choose_doctor_after_name",
          handoff_required: false,
          dialogueMerge: {
            flow_step: "choose_doctor",
            pending_kind: "doctors",
            pending_doctors: doctors,
            pending_clinics: [],
            pending_slots: [],
            collect_field: null,
            resume_after_name: null,
            hub_clinic_id: hub,
            last_specialty: d.last_specialty,
            consecutive_unparsed: 0,
            time_pref: tp,
            updated_at: nowIso(),
          },
        };
      }
      if (doctors.length === 1) {
        const doc = doctors[0]!;
        const so = await slotOfferPayload(pool, crm, d.last_specialty, doc.doctor_id, tp);
        return {
          reply_text: `شكراً ${name}.\n${so.reply}`,
          finalIntent: "BOOKING",
          finalPriority: 2,
          decision_source: "dialogue_slots_after_name",
          handoff_required: false,
          dialogueMerge: so.merge,
        };
      }
      return {
        reply_text: `شكراً ${name}. لا يوجد أطباء نشطون لهذا التخصص في العيادة حاليًا. يرجى التواصل مع السكرتارية.`,
        finalIntent: "BOOKING",
        finalPriority: 2,
        decision_source: "dialogue_no_doctors_after_name",
        handoff_required: false,
        dialogueMerge: {
          flow_step: "idle",
          pending_kind: null,
          pending_clinics: [],
          pending_doctors: [],
          pending_slots: [],
          consecutive_unparsed: 0,
          updated_at: nowIso(),
        },
      };
    }
    return unparsedInteractiveTurn(d, askPatientFullName(), norm.text);
  }

  if (step === "awaiting_specialty" && d.pending_kind === "specialties" && d.pending_specialties?.length) {
    const pick = parseListSelectionWithOrdinals1Based(norm.text, d.pending_specialties.length);
    if (pick == null) {
      return unparsedInteractiveTurn(d, repromptSpecialty(d.pending_specialties.length), norm.text);
    }
    const chosenSpec = d.pending_specialties[pick - 1]!;
    await setConversationSelectedSpecialty(pool, crm.conversation_id, chosenSpec.specialty_id, chosenSpec.code);
    void upsertPatientConversationMemory(pool, {
      clinic_id: crm.clinic_id,
      patient_id: crm.patient_id,
      facts_patch: {
        preferred_specialty_id: chosenSpec.specialty_id,
        preferred_specialty_code: chosenSpec.code,
      },
    }).catch(() => undefined);
    const envIds = routingClinicIdsFromEnv();
    const clinicIds = routingClinicIdsFromInputs(args.routing, envIds, crm.clinic_id);
    const doctors = await loadDoctorsBySpecialtyId(pool, clinicIds, chosenSpec.specialty_id);
    const tp = dialogueTimePrefFromStored(d);
    if (doctors.length === 0) {
      return {
        reply_text: noDoctorsForSpecialty(chosenSpec.label_ar),
        finalIntent: "BOOKING",
        finalPriority: 2,
        decision_source: "dialogue_no_doctors_for_specialty",
        handoff_required: false,
        dialogueMerge: {
          flow_step: "idle",
          pending_kind: null,
          pending_specialties: [],
          consecutive_unparsed: 0,
          last_specialty: chosenSpec.code,
          last_specialty_id: chosenSpec.specialty_id,
          updated_at: nowIso(),
        },
      };
    }
    if (doctors.length === 1) {
      const doc = doctors[0]!;
      const docR = await pool.query(`SELECT clinic_id FROM doctors WHERE id = $1`, [doc.doctor_id]);
      const docClinicId = Number(docR.rows[0]?.clinic_id || crm.clinic_id);
      await setConversationSelectedDoctor(pool, crm.conversation_id, doc.doctor_id, docClinicId);
      const so = await slotOfferPayload(pool, crm, chosenSpec.code, doc.doctor_id, tp);
      return {
        reply_text: `اخترت تخصص ${chosenSpec.label_ar} — د. ${doc.display_name}.\n${so.reply}`,
        finalIntent: "BOOKING",
        finalPriority: 2,
        decision_source: "dialogue_slots_after_specialty",
        handoff_required: false,
        dialogueMerge: {
          ...so.merge,
          last_specialty: chosenSpec.code,
          last_specialty_id: chosenSpec.specialty_id,
          hub_clinic_id: docClinicId,
        },
      };
    }
    const lines = doctors.map((x) => `${x.ix}) د. ${x.display_name} (${x.specialty})`);
    return {
      reply_text: `اخترت تخصص ${chosenSpec.label_ar}.\n${chooseDoctorIntro(lines.join("\n"))}`,
      finalIntent: "BOOKING",
      finalPriority: 2,
      decision_source: "dialogue_choose_doctor_after_specialty",
      handoff_required: false,
      dialogueMerge: {
        flow_step: "choose_doctor",
        pending_kind: "doctors",
        pending_doctors: doctors,
        pending_clinics: [],
        pending_slots: [],
        pending_specialties: [],
        last_specialty: chosenSpec.code,
        last_specialty_id: chosenSpec.specialty_id,
        consecutive_unparsed: 0,
        updated_at: nowIso(),
      },
    };
  }

  if (step === "choose_clinic" && d.pending_kind === "clinics" && d.pending_clinics?.length) {
    const pick = parseListSelectionWithOrdinals1Based(norm.text, d.pending_clinics.length);
    if (pick == null) {
      return unparsedInteractiveTurn(d, repromptChooseClinic(d.pending_clinics.length), norm.text);
    }
    const chosen = d.pending_clinics[pick - 1]!;
    const tp = dialogueTimePrefFromStored(d);
    return continueBookingAfterClinicChosen(pool, crm, chosen, d.last_specialty, tp, tp);
  }

  if (step === "choose_doctor" && d.pending_kind === "doctors" && d.pending_doctors?.length) {
    const pick = parseListSelectionWithOrdinals1Based(norm.text, d.pending_doctors.length);
    if (pick == null) {
      return unparsedInteractiveTurn(d, repromptChooseDoctor(), norm.text);
    }
    const doc = d.pending_doctors[pick - 1]!;
    const tp = dialogueTimePrefFromStored(d);
    // Persist doctor + its clinic so subsequent inbound messages stay routed.
    const docR = await pool.query(`SELECT clinic_id FROM doctors WHERE id = $1`, [doc.doctor_id]);
    const docClinicId = Number(docR.rows[0]?.clinic_id || crm.clinic_id);
    await setConversationSelectedDoctor(pool, crm.conversation_id, doc.doctor_id, docClinicId);
    void upsertPatientConversationMemory(pool, {
      clinic_id: docClinicId,
      patient_id: crm.patient_id,
      facts_patch: {
        preferred_doctor_id: doc.doctor_id,
        last_clinic_id: docClinicId,
        ...(d.last_specialty_id ? { preferred_specialty_id: d.last_specialty_id } : {}),
      },
    }).catch(() => undefined);
    const so = await slotOfferPayload(pool, crm, d.last_specialty, doc.doctor_id, tp);
    return {
      reply_text: `اخترت ${doc.display_name}.\n${so.reply}`,
      finalIntent: "BOOKING",
      finalPriority: 2,
      decision_source: "dialogue_slots",
      handoff_required: false,
      dialogueMerge: so.merge,
    };
  }

  if (step === "slot_offer" && d.pending_kind === "slots" && d.pending_slots?.length) {
    const raw = norm.text.trim();
    const compact = raw.replace(/\s+/g, " ");
    const isBack = compact === "0" || compact.includes("رجوع");
    const isMore = compact.includes("مواعيد") && (compact.includes("اخرى") || compact.includes("أخرى"));
    const isChangeDay = compact.includes("تغيير") && compact.includes("اليوم");

    if (isBack) {
      const clinicId = d.hub_clinic_id || crm.clinic_id;
      const doctors = await loadDoctors(pool, clinicId, d.last_specialty);
      if (doctors.length > 1) {
        const lines = doctors.map((x) => `${x.ix}) ${x.display_name} (${x.specialty})`);
        return {
          reply_text: chooseDoctorIntro(lines.join("\n")),
          finalIntent: "BOOKING",
          finalPriority: 2,
          decision_source: "dialogue_back_to_doctors",
          handoff_required: false,
          dialogueMerge: {
            flow_step: "choose_doctor",
            pending_kind: "doctors",
            pending_doctors: doctors,
            pending_slots: [],
            pending_clinics: [],
            hub_clinic_id: clinicId,
            last_specialty: d.last_specialty ?? null,
            consecutive_unparsed: 0,
            slot_page: 0,
            updated_at: nowIso(),
          },
        };
      }
      return unparsedInteractiveTurn(d, "للقائمة الرئيسية اكتب: قائمة أو 0", norm.text);
    }

    if (isMore || isChangeDay) {
      const doctorId = d.pending_slots?.[0]?.doctor_id;
      const tp = dialogueTimePrefFromStored(d);
      const nextPage = isMore ? (d.slot_page ?? 0) + 1 : 0;
      const so = await slotOfferPayload(pool, crm, d.last_specialty, doctorId, tp, {
        page: nextPage,
        forceNextDay: isChangeDay,
      });
      return {
        reply_text: so.reply,
        finalIntent: "BOOKING",
        finalPriority: 2,
        decision_source: isMore ? "dialogue_slots_more" : "dialogue_slots_change_day",
        handoff_required: false,
        dialogueMerge: so.merge,
      };
    }

    const pick = parseListSelectionWithOrdinals1Based(norm.text, d.pending_slots.length);
    if (pick == null) {
      const parsed = parseTimeOfDayFromText(norm.text);
      if (parsed) {
        const tzR = await pool.query(`SELECT timezone FROM clinics WHERE id = $1`, [d.hub_clinic_id || crm.clinic_id]);
        const tz = (tzR.rows[0]?.timezone as string) || "Asia/Amman";
        const match = d.pending_slots.find((s) => {
          const local = DateTime.fromISO(s.starts_at, { zone: "utc" }).setZone(tz);
          if (!local.isValid) return false;
          if (parsed.hasMinute) return local.hour === parsed.hour && local.minute === parsed.minute;
          return local.hour === parsed.hour;
        });
        if (match) {
          return {
            reply_text: "",
            finalIntent: "BOOKING",
            finalPriority: 2,
            decision_source: "dialogue_confirm_time_match",
            handoff_required: false,
            dialogueMerge: {},
            postProcess: slotConfirmPost(pool, crm, match),
          };
        }
      }
      return unparsedInteractiveTurn(d, repromptChooseSlot(d.pending_slots.length), norm.text);
    }
    const slot = d.pending_slots[pick - 1]!;
    if (/تجريبي|demo/i.test(slot.doctor_name)) {
      return buildMainMenuResetTurn();
    }
    const docActive = await pool.query(
      `SELECT 1 FROM doctors WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE
       AND display_name NOT ILIKE '%تجريبي%' AND display_name NOT ILIKE '%demo%' LIMIT 1`,
      [slot.doctor_id],
    );
    if (!docActive.rows[0]) {
      return buildMainMenuResetTurn();
    }
    return {
      reply_text: "",
      finalIntent: "BOOKING",
      finalPriority: 2,
      decision_source: "dialogue_confirm",
      handoff_required: false,
      dialogueMerge: {},
      postProcess: slotConfirmPost(pool, crm, slot),
    };
  }

  return null;
}

/**
 * First booking message: optional clinic list, doctor list, or direct slots.
 */
export async function startBookingDialogueFlow(
  pool: Pool,
  crm: InboundIngestRow,
  norm: NormalizedInboundRules,
  routing: Record<string, unknown>,
  interpret: InterpretResult,
  bookingText: string,
  opts?: { skipDisplayNamePrompt?: boolean },
): Promise<ConsumedBookingTurn> {
  const tpMerge = timePrefForMerge(bookingText);
  const timePrefActive: TimePreference | null = tpMerge;

  const ext = await extractBookingEntities(bookingText);
  if (ext.source === "ollama") {
    await logAiExtract(pool, {
      clinic_id: crm.clinic_id,
      conversation_id: crm.conversation_id,
      patient_id: crm.patient_id,
      kind: "booking_extract",
      input_excerpt: bookingText,
      output: ext as unknown as Record<string, unknown>,
    }).catch(() => undefined);
  }
  if (ext.patient_name_hint?.trim() && ext.patient_name_hint.trim().length >= 2) {
    await pool.query(
      `UPDATE patients SET display_name = $1, updated_at = NOW()
       WHERE id = $2 AND (display_name IS NULL OR trim(display_name) = '')`,
      [ext.patient_name_hint.trim().slice(0, 200), crm.patient_id],
    );
  }
  if (interpret.patient_name?.trim() && interpret.patient_name.trim().length >= 2) {
    await pool.query(
      `UPDATE patients SET display_name = $1, updated_at = NOW()
       WHERE id = $2 AND (display_name IS NULL OR trim(display_name) = '')`,
      [interpret.patient_name.trim().slice(0, 200), crm.patient_id],
    );
  }

  const envIds = routingClinicIdsFromEnv();
  const selected = selectedClinicFromRouting(routing);
  const effForHours = selected ?? crm.clinic_id;
  const pub = await getClinicPublicOpenStatus(pool, effForHours);
  if (!pub.open) {
    return {
      reply_text: pub.closed_message_ar,
      finalIntent: "BOOKING",
      finalPriority: 3,
      decision_source: "clinic_public_hours_closed",
      handoff_required: false,
      dialogueMerge: {
        flow_step: "idle",
        pending_kind: null,
        pending_slots: [],
        pending_doctors: [],
        pending_clinics: [],
        consecutive_unparsed: 0,
        updated_at: nowIso(),
      },
    };
  }

  const hasDisplay =
    opts?.skipDisplayNamePrompt === true ||
    (crm.patient_display_name && crm.patient_display_name.trim().length >= 2) ||
    (await patientHasDisplayName(pool, crm.patient_id));

  // ── Specialty-first menu ──────────────────────────────────────────────
  // When patient hasn't named a specialty AND the route has multiple specialties,
  // ask for specialty BEFORE clinic/doctor. Caller can lock specialty via routing.
  const selectedSpecialtyId =
    typeof routing.selected_specialty_id === "number" && Number.isFinite(routing.selected_specialty_id)
      ? (routing.selected_specialty_id as number)
      : null;
  const selectedDoctorId =
    typeof routing.selected_doctor_id === "number" && Number.isFinite(routing.selected_doctor_id)
      ? (routing.selected_doctor_id as number)
      : null;

  // Returning-patient shortcut: if memory has `preferred_doctor_id` and the
  // doctor is still active, jump straight to slots for that doctor. Skipped
  // when patient already named a specialty / doctor in this turn.
  if (!interpret.specialty && !interpret.doctor_hint && selectedSpecialtyId == null && selectedDoctorId == null && hasDisplay) {
    const memory = await fetchPatientConversationMemory(pool, crm.clinic_id, crm.patient_id).catch(() => null);
    const preferredDoctorId = Number(memory?.facts_jsonb?.preferred_doctor_id || 0);
    if (Number.isFinite(preferredDoctorId) && preferredDoctorId > 0) {
      const dr = await pool.query(
        `SELECT d.id, d.display_name, d.specialty, d.clinic_id
           FROM doctors d
          WHERE d.id = $1 AND d.deleted_at IS NULL AND d.is_active = TRUE
          ${EXCLUDE_DEMO_DOCTOR_SQL}
          LIMIT 1`,
        [preferredDoctorId],
      );
      const doc = dr.rows[0] as
        | { id: number; display_name: string; specialty: string; clinic_id: number }
        | undefined;
      if (doc) {
        const so = await slotOfferPayload(pool, crm, doc.specialty, doc.id, timePrefActive);
        return {
          reply_text: `أهلاً مجددًا. اقترحت لك مواعيد مع د. ${doc.display_name} كالسابق:\n${so.reply}`,
          finalIntent: "BOOKING",
          finalPriority: 2,
          decision_source: "dialogue_returning_patient_shortcut",
          handoff_required: false,
          dialogueMerge: {
            ...so.merge,
            hub_clinic_id: Number(doc.clinic_id),
          },
        };
      }
    }
  }

  if (!interpret.specialty && selectedSpecialtyId == null && selectedDoctorId == null && hasDisplay) {
    const routeClinicIds = routingClinicIdsFromInputs(routing, envIds, crm.clinic_id);
    const specs = await listSpecialtiesForClinics(pool, routeClinicIds).catch(() => []);
    if (specs.length >= 1) {
      const picks = buildSpecialtyPicks(specs);
      const lines = picks.map((s) => `${s.ix}) ${s.label_ar}`);
      return {
        reply_text: chooseSpecialtyIntro(lines.join("\n")),
        finalIntent: "BOOKING",
        finalPriority: 2,
        decision_source: "dialogue_choose_specialty",
        handoff_required: false,
        dialogueMerge: {
          flow_step: "awaiting_specialty",
          pending_kind: "specialties",
          pending_specialties: picks,
          pending_clinics: [],
          pending_doctors: [],
          pending_slots: [],
          hub_clinic_id: selected ?? crm.clinic_id,
          consecutive_unparsed: 0,
          time_pref: tpMerge,
          updated_at: nowIso(),
        },
      };
    }
  }

  if (envIds.length > 1 && selected == null) {
    const picks = await buildClinicPicks(pool, envIds);
    if (picks.length >= 2) {
      const autoIx = pickClinicIndexByHint(picks, interpret.clinic_hint);
      if (autoIx != null) {
        const chosen = picks.find((c) => c.ix === autoIx);
        if (chosen) {
          return continueBookingAfterClinicChosen(
            pool,
            crm,
            chosen,
            interpret.specialty,
            timePrefActive,
            tpMerge,
          );
        }
      }
      const lines = picks.map((c) => `${c.ix}) ${c.name}`);
      return {
        reply_text: chooseClinicIntro(lines.join("\n")),
        finalIntent: "BOOKING",
        finalPriority: 2,
        decision_source: "dialogue_choose_clinic",
        handoff_required: false,
        dialogueMerge: {
          flow_step: "choose_clinic",
          pending_kind: "clinics",
          pending_clinics: picks,
          pending_doctors: [],
          pending_slots: [],
          last_specialty: interpret.specialty,
          hub_clinic_id: crm.clinic_id,
          consecutive_unparsed: 0,
          time_pref: tpMerge,
          updated_at: nowIso(),
        },
      };
    }
  }

  const effClinic = selected ?? crm.clinic_id;
  let doctors = await loadDoctors(pool, effClinic, interpret.specialty);
  if (doctors.length === 0) {
    doctors = await loadDoctors(pool, effClinic, null);
  }
  const combinedDoctorHint = ext.doctor_name_hint?.trim() || interpret.doctor_hint?.trim() || null;
  if (doctors.length > 1 && combinedDoctorHint) {
    const ix = pickDoctorIndexByHint(doctors, combinedDoctorHint);
    if (ix != null) {
      const doc = doctors.find((x) => x.ix === ix);
      if (doc) {
        const so = await slotOfferPayload(pool, crm, interpret.specialty, doc.doctor_id, timePrefActive);
        return {
          reply_text: so.reply,
          finalIntent: "BOOKING",
          finalPriority: 2,
          decision_source: "dialogue_slots_ai_doctor_hint",
          handoff_required: false,
          dialogueMerge: so.merge,
        };
      }
    }
  }
  const specToken = specialtySearchTokenFromText(bookingText, interpret.doctor_hint, interpret.specialty);
  if (specToken) {
    const matchedId = await findDoctorIdBySpecialtyOrNameToken(pool, effClinic, specToken);
    if (matchedId != null) {
      const so = await slotOfferPayload(pool, crm, interpret.specialty, matchedId, timePrefActive);
      return {
        reply_text: so.reply,
        finalIntent: "BOOKING",
        finalPriority: 2,
        decision_source: "dialogue_slots_specialty_sql",
        handoff_required: false,
        dialogueMerge: so.merge,
      };
    }
  }
  if (doctors.length > 1) {
    const lines = doctors.map((x) => `${x.ix}) ${x.display_name} (${x.specialty})`);
    return {
      reply_text: chooseDoctorIntro(lines.join("\n")),
      finalIntent: "BOOKING",
      finalPriority: 2,
      decision_source: "dialogue_choose_doctor",
      handoff_required: false,
      dialogueMerge: {
        flow_step: "choose_doctor",
        pending_kind: "doctors",
        pending_doctors: doctors,
        pending_clinics: [],
        pending_slots: [],
        last_specialty: interpret.specialty,
        hub_clinic_id: crm.clinic_id,
        consecutive_unparsed: 0,
        time_pref: tpMerge,
        updated_at: nowIso(),
      },
    };
  }

  const doctorId = doctors.length === 1 ? doctors[0]!.doctor_id : undefined;

  if (!hasDisplay && (envIds.length <= 1 || selected != null)) {
    return {
      reply_text: askPatientFullName(),
      finalIntent: "BOOKING",
      finalPriority: 2,
      decision_source: "dialogue_collect_display_name",
      handoff_required: false,
      dialogueMerge: {
        flow_step: "awaiting_display_name",
        collect_field: "display_name",
        hub_clinic_id: selected ?? crm.clinic_id,
        resume_after_name: doctorId != null ? "doctors" : "specialty",
        pending_kind: null,
        pending_clinics: [],
        pending_doctors: [],
        pending_slots: [],
        last_specialty: interpret.specialty,
        consecutive_unparsed: 0,
        time_pref: tpMerge,
        updated_at: nowIso(),
      },
    };
  }

  const so = await slotOfferPayload(pool, crm, interpret.specialty, doctorId, timePrefActive);
  return {
    reply_text: so.reply,
    finalIntent: "BOOKING",
    finalPriority: 2,
    decision_source: "dialogue_slots",
    handoff_required: false,
    dialogueMerge: so.merge,
  };
}
