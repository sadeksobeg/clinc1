import { DateTime } from "luxon";
import type { Pool } from "pg";
import { findNextSlots } from "@/lib/scheduling/slotService";

export type DecisionPolicyError =
  | "expired"
  | "already_has_appointment"
  | "slot_unavailable"
  | "invalid_action_payload";

export type SuggestedActionForPolicy = {
  id: string;
  type: "CREATE_APPOINTMENT";
  created_at?: string;
  payload?: {
    suggested_time?: string;
    doctor_id?: number;
  };
};

export type DecisionExecutionContext = {
  pool: Pool;
  clinicId: number;
  patientId: number;
  conversationId: number;
};

export async function validateDecisionExecution(
  ctx: DecisionExecutionContext,
  action: SuggestedActionForPolicy,
): Promise<{ valid: boolean; errors: DecisionPolicyError[] }> {
  const errors: DecisionPolicyError[] = [];

  if (!action.payload?.suggested_time || !action.payload?.doctor_id) {
    errors.push("invalid_action_payload");
    return { valid: false, errors };
  }

  if (!isFreshAction(action.created_at)) {
    errors.push("expired");
  }

  const hasActive = await hasPatientActiveAppointment(ctx.pool, ctx.clinicId, ctx.patientId);
  if (hasActive) {
    errors.push("already_has_appointment");
  }

  const slotAvailable = await isSlotStillAvailable(
    ctx.pool,
    ctx.clinicId,
    Number(action.payload.doctor_id),
    action.payload.suggested_time,
  );
  if (!slotAvailable) {
    errors.push("slot_unavailable");
  }

  return { valid: errors.length === 0, errors };
}

export async function regenerateSuggestedCreateAppointment(args: {
  pool: Pool;
  clinicId: number;
  conversationId: number;
  reason: string;
  sourceChannel: string;
}): Promise<
  | {
      id: string;
      type: "CREATE_APPOINTMENT";
      status: "pending";
      created_at: string;
      reason: string;
      payload: {
        suggested_time: string;
        doctor_id: number;
        doctor_name: string;
        source_channel: string;
      };
    }
  | null
> {
  const slots = await findNextSlots(args.pool, {
    clinicId: args.clinicId,
    conversationId: args.conversationId,
    limit: 1,
  });
  const first = slots[0];
  if (!first) return null;
  return {
    id: `create-appointment:regen:${Date.now()}`,
    type: "CREATE_APPOINTMENT",
    status: "pending",
    created_at: new Date().toISOString(),
    reason: args.reason,
    payload: {
      suggested_time: first.starts_at,
      doctor_id: first.doctor_id,
      doctor_name: first.doctor_name,
      source_channel: args.sourceChannel,
    },
  };
}

function maxDecisionAgeMs(): number {
  const fromEnv = Number(process.env.DECISION_MAX_AGE_MS || "1800000");
  if (!Number.isFinite(fromEnv) || fromEnv < 60_000) return 30 * 60 * 1000;
  return Math.floor(fromEnv);
}

function isFreshAction(createdAt?: string): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= maxDecisionAgeMs();
}

async function hasPatientActiveAppointment(pool: Pool, clinicId: number, patientId: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT id
     FROM appointments
     WHERE clinic_id = $1
       AND patient_id = $2
       AND deleted_at IS NULL
       AND status IN ('pending', 'confirmed')
       AND starts_at >= NOW() - interval '1 hour'
     LIMIT 1`,
    [clinicId, patientId],
  );
  return Boolean(r.rows[0]);
}

async function isSlotStillAvailable(
  pool: Pool,
  clinicId: number,
  doctorId: number,
  startsAtIso: string,
): Promise<boolean> {
  const startsAt = DateTime.fromISO(startsAtIso, { zone: "utc" });
  if (!startsAt.isValid) return false;
  if (startsAt < DateTime.utc().minus({ minutes: 5 })) return false;

  const doc = await pool.query(
    `SELECT slot_duration_minutes
     FROM doctors
     WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
    [doctorId, clinicId],
  );
  if (!doc.rows[0]) return false;
  const duration = Number(doc.rows[0].slot_duration_minutes || 15);
  const endsAt = startsAt.plus({ minutes: Math.max(5, duration) });

  const overlap = await pool.query(
    `SELECT id
     FROM appointments
     WHERE clinic_id = $1
       AND doctor_id = $2
       AND deleted_at IS NULL
       AND status NOT IN ('cancelled', 'no_show')
       AND tstzrange(starts_at, ends_at, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
     LIMIT 1`,
    [clinicId, doctorId, startsAt.toISO(), endsAt.toISO()],
  );
  return !overlap.rows[0];
}
