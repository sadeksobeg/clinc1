import { DateTime } from "luxon";
import type { Pool } from "pg";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";
import { confirmAppointment } from "@/lib/scheduling/appointmentService";
import { listClinics, setConversationSelectedClinic } from "@/lib/scheduling/routingActions";
import { explainNoSlots, findNextSlots } from "@/lib/scheduling/slotService";
import type { InterpretResult } from "@/lib/scheduling/types";
import type { NormalizedInboundRules } from "./normalizeInbound";
import { parseListSelection1Based } from "./dialogueParse";
import {
  chooseClinicIntro,
  chooseDoctorIntro,
  confusedRecoveryMenu,
  handoffToSecretary,
  repromptChooseClinic,
  repromptChooseDoctor,
  repromptChooseSlot,
  singleSlotConfirmLine,
  slotListIntro,
} from "./patientCopy";
import { detectTimePreference, filterSlotsByTimePreference, type TimePreference } from "./timePreference";
import type {
  DialogueTimePref,
  PendingClinicPick,
  PendingDoctorPick,
  PendingSlotOffer,
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

function unparsedInteractiveTurn(
  d: StoredDialogueState,
  specificReprompt: string,
): ConsumedBookingTurn {
  const prev = d.consecutive_unparsed ?? 0;
  const next = prev + 1;
  if (next >= FAILSAFE_UNPARSED_THRESHOLD) {
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
    `SELECT id, display_name, specialty
     FROM doctors
     WHERE clinic_id = $1 AND deleted_at IS NULL AND is_active = TRUE
       AND ($2::text IS NULL OR lower(specialty) = lower($2::text))
     ORDER BY id ASC
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
    return `${i + 1}) ${s.doctor_name} — ${t.toFormat("yyyy-LL-dd HH:mm")}`;
  });
}

async function slotOfferPayload(
  pool: Pool,
  crm: InboundIngestRow,
  specialty: string | null | undefined,
  doctorId: number | undefined,
  timePref: TimePreference | null,
): Promise<{ reply: string; merge: Record<string, unknown> }> {
  let fetchLimit = 3;
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
    chosen = slots.slice(0, 3);
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
    const whenLabel = t.isValid ? t.toFormat("yyyy-LL-dd HH:mm") : s.starts_at;
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
    const when = t.isValid ? t.toFormat("yyyy-LL-dd HH:mm") : slot.starts_at;
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
  const step = d.flow_step;

  if (step === "choose_clinic" && d.pending_kind === "clinics" && d.pending_clinics?.length) {
    const pick = parseListSelection1Based(norm.text, d.pending_clinics.length);
    if (pick == null) {
      return unparsedInteractiveTurn(d, repromptChooseClinic(d.pending_clinics.length));
    }
    const chosen = d.pending_clinics[pick - 1]!;
    await setConversationSelectedClinic(pool, crm.conversation_id, chosen.clinic_id);
    const doctors = await loadDoctors(pool, chosen.clinic_id, d.last_specialty);
    const tp = dialogueTimePrefFromStored(d);
    if (doctors.length > 1) {
      const lines = doctors.map((x) => `${x.ix}) ${x.display_name} (${x.specialty})`);
      return {
        reply_text: `تم اختيار العيادة: ${chosen.name}.\n${chooseDoctorIntro(lines.join("\n"))}`,
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
          consecutive_unparsed: 0,
          updated_at: nowIso(),
        },
      };
    }
    if (doctors.length === 1) {
      const doc = doctors[0]!;
      const so = await slotOfferPayload(pool, crm, d.last_specialty, doc.doctor_id, tp);
      return {
        reply_text: `تم اختيار العيادة: ${chosen.name}.\n${so.reply}`,
        finalIntent: "BOOKING",
        finalPriority: 2,
        decision_source: "dialogue_slots",
        handoff_required: false,
        dialogueMerge: so.merge,
      };
    }
    return {
      reply_text: `تم اختيار العيادة: ${chosen.name}، لكن لا يوجد أطباء نشطون لهذا التخصص حاليًا. يرجى التواصل مع السكرتارية.`,
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

  if (step === "choose_doctor" && d.pending_kind === "doctors" && d.pending_doctors?.length) {
    const pick = parseListSelection1Based(norm.text, d.pending_doctors.length);
    if (pick == null) {
      return unparsedInteractiveTurn(d, repromptChooseDoctor());
    }
    const doc = d.pending_doctors[pick - 1]!;
    const tp = dialogueTimePrefFromStored(d);
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
    const pick = parseListSelection1Based(norm.text, d.pending_slots.length);
    if (pick == null) {
      return unparsedInteractiveTurn(d, repromptChooseSlot(d.pending_slots.length));
    }
    const slot = d.pending_slots[pick - 1]!;
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
): Promise<ConsumedBookingTurn> {
  const tpMerge = timePrefForMerge(bookingText);
  const timePrefActive: TimePreference | null = tpMerge;

  const envIds = routingClinicIdsFromEnv();
  const selected = selectedClinicFromRouting(routing);

  if (envIds.length > 1 && selected == null) {
    const picks = await buildClinicPicks(pool, envIds);
    if (picks.length >= 2) {
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
  const doctors = await loadDoctors(pool, effClinic, interpret.specialty);
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
