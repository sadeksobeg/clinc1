import type { Pool } from "pg";
import { getRedisInboundOpsClient } from "./redisInboundOpsClient";

function prefetchEnabled(): boolean {
  return (process.env.INBOUND_PREFETCH_CLINIC_SCHEDULE || "").trim() === "1";
}

function ttlSec(): number {
  const n = Number(process.env.INBOUND_PREFETCH_SCHEDULE_TTL_SEC || 90);
  return Number.isFinite(n) && n >= 15 && n <= 600 ? Math.floor(n) : 90;
}

/**
 * Warm Redis with doctors + public hours for a clinic after routing locks a clinic in the booking FSM.
 */
export async function maybePrefetchClinicScheduleAfterRoutingLock(pool: Pool, clinicId: number): Promise<void> {
  if (!prefetchEnabled() || clinicId <= 0) return;
  const client = await getRedisInboundOpsClient();
  if (!client) return;
  const ex = ttlSec();
  try {
    const doctors = await pool.query(
      `SELECT id, display_name, specialty, slot_duration_minutes, is_active
       FROM doctors
       WHERE clinic_id = $1 AND deleted_at IS NULL
       ORDER BY is_active DESC, display_name ASC`,
      [clinicId],
    );
    const hours = await pool.query(
      `SELECT weekday, open_local, close_local, closed
       FROM clinic_public_hours
       WHERE clinic_id = $1
       ORDER BY weekday ASC`,
      [clinicId],
    );
    const docKey = `prefetch:doctors:${clinicId}`;
    const hoursKey = `prefetch:clinic_public_hours:${clinicId}`;
    await client.set(docKey, JSON.stringify(doctors.rows), { EX: ex });
    await client.set(hoursKey, JSON.stringify(hours.rows), { EX: ex });
  } catch {
    /* ignore */
  }
}
