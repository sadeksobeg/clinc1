import type { Pool, PoolClient } from "pg";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

/** Max age of last patient inbound for proactive outbox sends (WhatsApp reply-only policy). */
export function patientReplyWindowMs(): number {
  const raw = (process.env.PATIENT_REPLY_WINDOW_MS || "").trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const mins = (process.env.PATIENT_REPLY_WINDOW_MINUTES || "").trim();
  if (mins) {
    const m = Number.parseInt(mins, 10);
    if (Number.isFinite(m) && m > 0) return m * 60 * 1000;
  }
  return DEFAULT_WINDOW_MS;
}

export function isRecentPatientInbound(lastInboundAt: Date | null, nowMs: number = Date.now()): boolean {
  if (!lastInboundAt || !Number.isFinite(lastInboundAt.getTime())) return false;
  return nowMs - lastInboundAt.getTime() < patientReplyWindowMs();
}

/**
 * Latest inbound WhatsApp message from this patient (any conversation).
 */
export async function getLastPatientInboundAt(
  pool: Pool | PoolClient,
  args: { clinicId: number; patientId: number },
): Promise<Date | null> {
  const r = await pool.query(
    `SELECT MAX(m.created_at) AS t
     FROM messages m
     WHERE m.clinic_id = $1 AND m.patient_id = $2 AND m.direction = 'inbound'`,
    [args.clinicId, args.patientId],
  );
  const t = r.rows[0]?.t as Date | string | null | undefined;
  if (t == null) return null;
  const d = t instanceof Date ? t : new Date(String(t));
  return Number.isFinite(d.getTime()) ? d : null;
}

/** True if this patient has any inbound within the configured reply window (for proactive enqueue). */
export async function isPatientRecentlyActive(
  pool: Pool | PoolClient,
  args: { clinicId: number; patientId: number },
): Promise<boolean> {
  const t = await getLastPatientInboundAt(pool, args);
  return isRecentPatientInbound(t);
}
