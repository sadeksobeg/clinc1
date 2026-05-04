import type { Pool, PoolClient } from "pg";
import { DateTime } from "luxon";

export type ConfirmParams = {
  clinicId: number;
  patientId: number;
  doctorId: number;
  startsAtIso: string;
  conversationId?: number | null;
  staffUserId?: number | null;
  idempotencyKey?: string | null;
  sourceChannel?: string;
};

export type ConfirmResult =
  | { ok: true; appointment_id: number; duplicate?: boolean }
  | { ok: false; error: string; code: "overlap" | "invalid" | "not_found" };

async function dayBoundsUtc(zone: string, startsAtIso: string): Promise<{ start: string; end: string }> {
  const st = DateTime.fromISO(startsAtIso, { zone: "utc" });
  const local = st.setZone(zone);
  const start = local.startOf("day").toUTC();
  const end = local.endOf("day").toUTC();
  return { start: start.toISO()!, end: end.toISO()! };
}

export async function confirmAppointment(pool: Pool, params: ConfirmParams): Promise<ConfirmResult> {
  const client = await pool.connect();
  try {
    return await confirmAppointmentTx(client, params);
  } finally {
    client.release();
  }
}

export async function confirmAppointmentTx(client: PoolClient, params: ConfirmParams): Promise<ConfirmResult> {
  const c = await client.query(`SELECT timezone FROM clinics WHERE id = $1`, [params.clinicId]);
  const zone = (c.rows[0]?.timezone as string) || "Asia/Amman";

  const doc = await client.query(
    `SELECT slot_duration_minutes FROM doctors WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
    [params.doctorId, params.clinicId],
  );
  if (!doc.rows[0]) return { ok: false, error: "Doctor not found", code: "not_found" };

  const slotMin = Number(doc.rows[0]?.slot_duration_minutes || 15);
  const startsAt = DateTime.fromISO(params.startsAtIso, { zone: "utc" });
  if (!startsAt.isValid) return { ok: false, error: "Invalid starts_at", code: "invalid" };
  const endsAt = startsAt.plus({ minutes: slotMin });

  const { start: dayStart, end: dayEnd } = await dayBoundsUtc(zone, params.startsAtIso);

  await client.query("BEGIN");
  try {
    if (params.conversationId) {
      await client.query(`SELECT id FROM conversations WHERE id = $1 FOR UPDATE`, [params.conversationId]);
    }
    await client.query(`SELECT id FROM doctors WHERE id = $1 AND clinic_id = $2 FOR UPDATE`, [
      params.doctorId,
      params.clinicId,
    ]);

    const idem = params.idempotencyKey?.trim();
    if (idem) {
      const ex = await client.query(
        `SELECT id FROM appointments WHERE idempotency_key = $1 AND deleted_at IS NULL LIMIT 1`,
        [idem],
      );
      if (ex.rows[0]) {
        await client.query("COMMIT");
        return { ok: true, appointment_id: Number(ex.rows[0].id), duplicate: true };
      }
    }

    await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND deleted_at IS NULL
         AND starts_at >= $2::timestamptz AND starts_at <= $3::timestamptz
         AND status NOT IN ('cancelled', 'no_show')
       FOR UPDATE`,
      [params.doctorId, dayStart, dayEnd],
    );

    const overlap = await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND deleted_at IS NULL
         AND status NOT IN ('cancelled', 'no_show')
         AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
      [params.doctorId, startsAt.toISO(), endsAt.toISO()],
    );
    if (overlap.rowCount && overlap.rowCount > 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Slot overlap", code: "overlap" };
    }

    const seq = await client.query(
      `SELECT COALESCE(MAX(sequence_no), 0) + 1 AS n FROM appointments
       WHERE doctor_id = $1 AND deleted_at IS NULL
         AND starts_at >= $2::timestamptz AND starts_at <= $3::timestamptz`,
      [params.doctorId, dayStart, dayEnd],
    );
    const sequenceNo = Number(seq.rows[0]?.n || 1);

    const ins = await client.query(
      `INSERT INTO appointments (
         clinic_id, patient_id, conversation_id, doctor_id,
         starts_at, ends_at, status, source_channel,
         staff_user_id, sequence_no, patient_arrival_state, confirmed_at, idempotency_key
       ) VALUES (
         $1, $2, $3, $4,
         $5::timestamptz, $6::timestamptz, 'confirmed', $7,
         $8, $9, 'expected', NOW(), $10
       ) RETURNING id`,
      [
        params.clinicId,
        params.patientId,
        params.conversationId ?? null,
        params.doctorId,
        startsAt.toISO(),
        endsAt.toISO(),
        params.sourceChannel || "whatsapp",
        params.staffUserId ?? null,
        sequenceNo,
        idem || null,
      ],
    );
    await client.query("COMMIT");
    return { ok: true, appointment_id: Number(ins.rows[0].id) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

export type StaffCancelParams = { appointmentId: number; clinicId: number };

export async function staffCancelAppointment(
  pool: Pool,
  p: StaffCancelParams,
): Promise<{ ok: true } | { ok: false; code: "not_found" }> {
  const u = await pool.query(
    `UPDATE appointments
     SET status = 'cancelled',
         cancelled_at = COALESCE(cancelled_at, NOW()),
         updated_at = NOW()
     WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL
       AND status NOT IN ('cancelled', 'completed', 'no_show')
     RETURNING id`,
    [p.appointmentId, p.clinicId],
  );
  if (!u.rowCount) return { ok: false, code: "not_found" };
  return { ok: true };
}

export type StaffRescheduleParams = { appointmentId: number; clinicId: number; startsAtIso: string };

export async function staffRescheduleAppointment(
  pool: Pool,
  p: StaffRescheduleParams,
): Promise<{ ok: true } | { ok: false; code: "not_found" | "overlap" | "invalid" }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ap = await client.query(
      `SELECT id, doctor_id FROM appointments
       WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL
         AND status NOT IN ('cancelled', 'completed', 'no_show')
       FOR UPDATE`,
      [p.appointmentId, p.clinicId],
    );
    if (!ap.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, code: "not_found" };
    }
    const doctorId = Number((ap.rows[0] as { doctor_id: number }).doctor_id);
    const doc = await client.query(
      `SELECT slot_duration_minutes FROM doctors WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
      [doctorId, p.clinicId],
    );
    if (!doc.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, code: "not_found" };
    }
    const slotMin = Number(doc.rows[0]?.slot_duration_minutes || 15);
    const startsAt = DateTime.fromISO(p.startsAtIso, { zone: "utc" });
    if (!startsAt.isValid) {
      await client.query("ROLLBACK");
      return { ok: false, code: "invalid" };
    }
    const endsAt = startsAt.plus({ minutes: slotMin });
    const ov = await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND deleted_at IS NULL AND id <> $2
         AND status NOT IN ('cancelled', 'no_show')
         AND tstzrange(starts_at, ends_at, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')`,
      [doctorId, p.appointmentId, startsAt.toISO(), endsAt.toISO()],
    );
    if (ov.rowCount && ov.rowCount > 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: "overlap" };
    }
    await client.query(
      `UPDATE appointments
       SET starts_at = $1::timestamptz, ends_at = $2::timestamptz, updated_at = NOW()
       WHERE id = $3 AND clinic_id = $4`,
      [startsAt.toISO(), endsAt.toISO(), p.appointmentId, p.clinicId],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
