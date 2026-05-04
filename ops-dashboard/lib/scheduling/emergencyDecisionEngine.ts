import { DateTime } from "luxon";
import type { Pool } from "pg";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";
import { confirmAppointment, confirmAppointmentTx } from "./appointmentService";
import { findNextSlots } from "./slotService";

export type EmergencyBumpNotice = {
  patient_id: number;
  conversation_id: number | null;
  chat_id: string;
  display_name: string | null;
  previous_starts_at: string;
  rescheduled_starts_at: string;
};

export type EmergencyDecisionResult =
  | {
      ok: true;
      outcome: "allocated_direct";
      starts_at: string;
      doctor_id: number;
      doctor_name: string;
      appointment_id: number;
    }
  | {
      ok: true;
      outcome: "allocated_next_day_override";
      starts_at: string;
      doctor_id: number;
      doctor_name: string;
      appointment_id: number;
    }
  | {
      ok: true;
      outcome: "allocated_with_soft_bump";
      starts_at: string;
      doctor_id: number;
      doctor_name: string;
      appointment_id: number;
      bumped: EmergencyBumpNotice;
    }
  | {
      ok: false;
      reason: "no_same_day_slot" | "soft_bump_unavailable" | "allocation_failed";
    };

type AppointmentCandidate = {
  id: number;
  doctor_id: number;
  starts_at: string;
  ends_at: string;
  conversation_id: number | null;
  patient_id: number;
  patient_chat_id: string;
  patient_name: string | null;
};

function parseTs(value: string, zone?: string): DateTime {
  const trimmed = String(value || "").trim();
  const tryIso = DateTime.fromISO(trimmed, zone ? { zone } : undefined);
  if (tryIso.isValid) return tryIso;
  const normalized = trimmed.includes(" ") ? trimmed.replace(" ", "T") : trimmed;
  const tryNormalized = DateTime.fromISO(normalized, zone ? { zone } : undefined);
  if (tryNormalized.isValid) return tryNormalized;
  const trySql = DateTime.fromSQL(trimmed, zone ? { zone } : undefined);
  if (trySql.isValid) return trySql;
  const js = new Date(trimmed);
  if (Number.isFinite(js.getTime())) return DateTime.fromJSDate(js, zone ? { zone } : undefined);
  return DateTime.invalid("unparsable timestamp");
}

function isSameClinicDay(iso: string, nowLocal: DateTime): boolean {
  const zone = nowLocal.zoneName || "Asia/Amman";
  const t = parseTs(iso, "utc").setZone(zone);
  return t.isValid && t.hasSame(nowLocal, "day");
}

function pickSameDaySlot(
  slots: Array<{ starts_at: string; ends_at: string; doctor_id: number; doctor_name: string }>,
  nowLocal: DateTime,
): { starts_at: string; ends_at: string; doctor_id: number; doctor_name: string } | null {
  const zone = nowLocal.zoneName || "Asia/Amman";
  for (const slot of slots) {
    const t = DateTime.fromISO(slot.starts_at, { zone: "utc" }).setZone(zone);
    if (!t.isValid) continue;
    if (t < nowLocal) continue;
    if (!t.hasSame(nowLocal, "day")) continue;
    return slot;
  }
  return null;
}

function pickFirstFutureSlot(
  slots: Array<{ starts_at: string; ends_at: string; doctor_id: number; doctor_name: string }>,
  nowUtc: DateTime,
): { starts_at: string; ends_at: string; doctor_id: number; doctor_name: string } | null {
  for (const slot of slots) {
    const t = DateTime.fromISO(slot.starts_at, { zone: "utc" });
    if (!t.isValid) continue;
    if (t <= nowUtc) continue;
    return slot;
  }
  return null;
}

async function fetchClinicTimezone(pool: Pool, clinicId: number): Promise<string> {
  const r = await pool.query(`SELECT timezone FROM clinics WHERE id = $1`, [clinicId]);
  return (r.rows[0]?.timezone as string) || "Asia/Amman";
}

async function findEarliestNonUrgentTodayCandidate(
  pool: Pool,
  clinicId: number,
  emergencyPatientId: number,
  dayStartUtcIso: string,
  dayEndUtcIso: string,
): Promise<AppointmentCandidate | null> {
  const r = await pool.query(
    `SELECT
       a.id,
       a.doctor_id,
       a.starts_at,
       a.ends_at,
       a.conversation_id,
       a.patient_id,
       p.chat_id AS patient_chat_id,
       p.display_name AS patient_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.clinic_id = $1
       AND a.deleted_at IS NULL
       AND a.status = 'confirmed'
       AND a.patient_id <> $2
       AND a.starts_at >= $3::timestamptz
       AND a.starts_at < $4::timestamptz
       AND NOT EXISTS (
         SELECT 1
         FROM cases c
         WHERE c.clinic_id = a.clinic_id
           AND c.patient_id = a.patient_id
           AND c.status = 'open'
           AND c.priority = 'high'
       )
     ORDER BY a.starts_at ASC
     LIMIT 1`,
    [clinicId, emergencyPatientId, dayStartUtcIso, dayEndUtcIso],
  );
  if (!r.rows[0]) return null;
  return {
    id: Number(r.rows[0].id),
    doctor_id: Number(r.rows[0].doctor_id),
    starts_at: String(r.rows[0].starts_at),
    ends_at: String(r.rows[0].ends_at),
    conversation_id: r.rows[0].conversation_id != null ? Number(r.rows[0].conversation_id) : null,
    patient_id: Number(r.rows[0].patient_id),
    patient_chat_id: String(r.rows[0].patient_chat_id || "").trim(),
    patient_name: r.rows[0].patient_name != null ? String(r.rows[0].patient_name) : null,
  };
}

export async function runEmergencyDecisionEngine(
  pool: Pool,
  crm: InboundIngestRow,
  opts?: { allowNextDayOverride?: boolean },
): Promise<EmergencyDecisionResult> {
  const zone = await fetchClinicTimezone(pool, crm.clinic_id);
  const nowLocal = DateTime.utc().setZone(zone);
  const dayStartUtcIso = nowLocal.startOf("day").toUTC().toISO();
  const dayEndUtcIso = nowLocal.endOf("day").toUTC().toISO();
  if (!dayStartUtcIso || !dayEndUtcIso) {
    return { ok: false, reason: "allocation_failed" };
  }

  const directSlots = await findNextSlots(pool, {
    clinicId: crm.clinic_id,
    conversationId: crm.conversation_id,
    limit: 12,
    horizonDays: opts?.allowNextDayOverride ? 3 : 1,
  });
  const direct = pickSameDaySlot(directSlots, nowLocal);
  if (direct) {
    const confirmed = await confirmAppointment(pool, {
      clinicId: crm.clinic_id,
      patientId: crm.patient_id,
      doctorId: direct.doctor_id,
      startsAtIso: direct.starts_at,
      conversationId: crm.conversation_id,
      idempotencyKey: `emergency:${crm.conversation_id}:${direct.starts_at}`,
      sourceChannel: "whatsapp_emergency",
    });
    if (confirmed.ok) {
      return {
        ok: true,
        outcome: "allocated_direct",
        starts_at: direct.starts_at,
        doctor_id: direct.doctor_id,
        doctor_name: direct.doctor_name,
        appointment_id: confirmed.appointment_id,
      };
    }
  }

  if (opts?.allowNextDayOverride) {
    const future = pickFirstFutureSlot(directSlots, DateTime.utc());
    if (future) {
      const confirmed = await confirmAppointment(pool, {
        clinicId: crm.clinic_id,
        patientId: crm.patient_id,
        doctorId: future.doctor_id,
        startsAtIso: future.starts_at,
        conversationId: crm.conversation_id,
        idempotencyKey: `emergency:override:${crm.conversation_id}:${future.starts_at}`,
        sourceChannel: "whatsapp_emergency",
      });
      if (confirmed.ok) {
        return {
          ok: true,
          outcome: "allocated_next_day_override",
          starts_at: future.starts_at,
          doctor_id: future.doctor_id,
          doctor_name: future.doctor_name,
          appointment_id: confirmed.appointment_id,
        };
      }
    }
  }

  const candidate = await findEarliestNonUrgentTodayCandidate(
    pool,
    crm.clinic_id,
    crm.patient_id,
    dayStartUtcIso,
    dayEndUtcIso,
  );
  if (!candidate) {
    return { ok: false, reason: "no_same_day_slot" };
  }

  const candidateSlots = await findNextSlots(pool, {
    clinicId: crm.clinic_id,
    doctorId: candidate.doctor_id,
    limit: 24,
    horizonDays: 1,
  });
  const replacement = candidateSlots.find((slot) => {
    if (!isSameClinicDay(slot.starts_at, nowLocal)) return false;
    if (slot.starts_at === candidate.starts_at) return false;
    const replacementLocal = parseTs(slot.starts_at, "utc").setZone(zone);
    const candidateLocal = parseTs(candidate.starts_at, "utc").setZone(zone);
    if (!replacementLocal.isValid || !candidateLocal.isValid) return false;
    return replacementLocal > candidateLocal;
  });
  if (!replacement) {
    return { ok: false, reason: "soft_bump_unavailable" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT id, starts_at, ends_at, doctor_id
       FROM appointments
       WHERE id = $1 AND clinic_id = $2 AND status = 'confirmed' AND deleted_at IS NULL
       FOR UPDATE`,
      [candidate.id, crm.clinic_id],
    );
    if (!locked.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "soft_bump_unavailable" };
    }
    const overlap = await client.query(
      `SELECT id
       FROM appointments
       WHERE doctor_id = $1
         AND deleted_at IS NULL
         AND status NOT IN ('cancelled', 'no_show')
         AND id <> $2
         AND tstzrange(starts_at, ends_at, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
       LIMIT 1`,
      [candidate.doctor_id, candidate.id, replacement.starts_at, replacement.ends_at],
    );
    if (overlap.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "soft_bump_unavailable" };
    }

    await client.query(
      `UPDATE appointments
       SET starts_at = $1::timestamptz,
           ends_at = $2::timestamptz,
           updated_at = NOW()
       WHERE id = $3 AND clinic_id = $4`,
      [replacement.starts_at, replacement.ends_at, candidate.id, crm.clinic_id],
    );

    const candidateStartsUtcIso = parseTs(candidate.starts_at).toUTC().toISO();
    if (!candidateStartsUtcIso) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "allocation_failed" };
    }
    const confirm = await confirmAppointmentTx(client, {
      clinicId: crm.clinic_id,
      patientId: crm.patient_id,
      doctorId: candidate.doctor_id,
      startsAtIso: candidateStartsUtcIso,
      conversationId: crm.conversation_id,
      idempotencyKey: `emergency:bump:${crm.conversation_id}:${candidate.starts_at}`,
      sourceChannel: "whatsapp_emergency",
    });
    if (!confirm.ok) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "allocation_failed" };
    }
    await client.query("COMMIT");
    return {
      ok: true,
      outcome: "allocated_with_soft_bump",
      starts_at: candidateStartsUtcIso,
      doctor_id: candidate.doctor_id,
      doctor_name: replacement.doctor_name,
      appointment_id: confirm.appointment_id,
      bumped: {
        patient_id: candidate.patient_id,
        conversation_id: candidate.conversation_id,
        chat_id: candidate.patient_chat_id,
        display_name: candidate.patient_name,
        previous_starts_at: candidate.starts_at,
        rescheduled_starts_at: replacement.starts_at,
      },
    };
  } catch {
    await client.query("ROLLBACK");
    return { ok: false, reason: "allocation_failed" };
  } finally {
    client.release();
  }
}
