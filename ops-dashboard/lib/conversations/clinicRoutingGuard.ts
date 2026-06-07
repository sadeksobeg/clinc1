import type { Pool } from "pg";
import { incProductMetric } from "@/lib/observability/productMetrics";

export type ClinicLockReason = "user_selected" | "number_route" | "default";

export type ClinicRoutingState = {
  locked_clinic_id: number | null;
  locked_at: string | null;
  lock_reason: ClinicLockReason | null;
  session_message_count: number;
};

export function readClinicRoutingState(routing: Record<string, unknown>): ClinicRoutingState {
  const locked = routing.locked_clinic_id;
  const locked_clinic_id =
    typeof locked === "number" && Number.isFinite(locked) && locked > 0 ? Math.floor(locked) : null;
  const locked_at = typeof routing.locked_at === "string" ? routing.locked_at : null;
  const lock_reason =
    routing.lock_reason === "user_selected" ||
    routing.lock_reason === "number_route" ||
    routing.lock_reason === "default"
      ? routing.lock_reason
      : null;
  const session_message_count = Number(routing.session_message_count ?? 0);
  return {
    locked_clinic_id,
    locked_at,
    lock_reason,
    session_message_count: Number.isFinite(session_message_count) ? Math.max(0, session_message_count) : 0,
  };
}

/** Read locked clinic — takes precedence over selected_clinic_id everywhere. */
export function getLockedClinic(routing: Record<string, unknown>): number | null {
  return readClinicRoutingState(routing).locked_clinic_id;
}

export function resolveEffectiveClinicId(
  routing: Record<string, unknown>,
  fallbackClinicId: number,
): number {
  const locked = getLockedClinic(routing);
  if (locked != null) return locked;
  const sel = routing.selected_clinic_id;
  if (typeof sel === "number" && Number.isFinite(sel) && sel > 0) return Math.floor(sel);
  return fallbackClinicId;
}

export async function ensureClinicLock(
  pool: Pool,
  convId: number,
  clinicId: number,
  reason: ClinicLockReason,
  sessionCount?: number,
): Promise<void> {
  const patch = {
    locked_clinic_id: clinicId,
    selected_clinic_id: clinicId,
    lock_reason: reason,
    locked_at: new Date().toISOString(),
    session_message_count: sessionCount ?? 1,
  };
  await pool.query(
    `UPDATE conversations
     SET routing = COALESCE(routing, '{}'::jsonb) || $1::jsonb,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(patch), convId],
  );
  incProductMetric("clinic_lock_applied_total");
}

export async function releaseClinicLock(pool: Pool, convId: number): Promise<void> {
  await pool.query(
    `UPDATE conversations
     SET routing = COALESCE(routing, '{}'::jsonb)
       - 'locked_clinic_id'
       - 'lock_reason'
       - 'locked_at'
       - 'session_message_count',
         updated_at = NOW()
     WHERE id = $1`,
    [convId],
  );
}

export async function incrementSessionMessageCount(pool: Pool, convId: number): Promise<void> {
  await pool.query(
    `UPDATE conversations c
     SET routing = COALESCE(c.routing, '{}'::jsonb) || jsonb_build_object(
           'session_message_count',
           COALESCE((c.routing->>'session_message_count')::int, 0) + 1
         ),
         updated_at = NOW()
     WHERE c.id = $1`,
    [convId],
  );
}
