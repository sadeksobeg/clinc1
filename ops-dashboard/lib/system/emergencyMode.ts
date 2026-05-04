import type { Pool } from "pg";
import { getPool } from "@/lib/db";
import { insertAuditLog } from "@/lib/auditTrail";
import { writeStructuredLog } from "@/lib/observability/trace";

export type RuntimeFlagKey =
  | "whatsapp_send_disabled"
  | "ai_autoreply_disabled"
  | "auto_booking_disabled"
  | "emergency_global_disable";

type RuntimeFlagRow = {
  flag_key: RuntimeFlagKey;
  flag_value: "on" | "off";
  updated_by: string | null;
  reason: string | null;
  updated_at: string;
};

const managedFlagKeys: RuntimeFlagKey[] = [
  "whatsapp_send_disabled",
  "ai_autoreply_disabled",
  "auto_booking_disabled",
  "emergency_global_disable",
];

const cache = new Map<RuntimeFlagKey, { value: boolean; expiresAt: number }>();
const CACHE_MS = 2000;

function envFallback(flag: RuntimeFlagKey): boolean {
  if (flag === "whatsapp_send_disabled") return String(process.env.WHATSAPP_KILL_SWITCH || "").toLowerCase() === "true";
  if (flag === "ai_autoreply_disabled") return String(process.env.INBOUND_DECISION_ENGINE || "").trim() !== "1";
  if (flag === "auto_booking_disabled") return String(process.env.INBOUND_AUTO_BOOK || "").trim() !== "1";
  return String(process.env.EMERGENCY_GLOBAL_DISABLE || "").trim() === "1";
}

export async function getRuntimeFlag(
  flag: RuntimeFlagKey,
  opts?: { pool?: Pool; forceRefresh?: boolean },
): Promise<boolean> {
  const now = Date.now();
  const fromCache = cache.get(flag);
  if (!opts?.forceRefresh && fromCache && fromCache.expiresAt > now) {
    return fromCache.value;
  }
  if (!opts?.pool && !process.env.DATABASE_URL?.trim()) {
    const fb = envFallback(flag);
    cache.set(flag, { value: fb, expiresAt: now + CACHE_MS });
    return fb;
  }
  const pool = opts?.pool || getPool();
  try {
    const r = await pool.query<RuntimeFlagRow>(
      `SELECT flag_key, flag_value, updated_by, reason, updated_at
       FROM system_runtime_flags
       WHERE flag_key = $1`,
      [flag],
    );
    if (!r.rows[0]) {
      const fb = envFallback(flag);
      cache.set(flag, { value: fb, expiresAt: now + CACHE_MS });
      return fb;
    }
    const v = r.rows[0].flag_value === "on";
    cache.set(flag, { value: v, expiresAt: now + CACHE_MS });
    return v;
  } catch {
    const fb = envFallback(flag);
    cache.set(flag, { value: fb, expiresAt: now + CACHE_MS });
    return fb;
  }
}

export async function readEmergencyModeSnapshot(pool: Pool) {
  const r = await pool.query<RuntimeFlagRow>(
    `SELECT flag_key, flag_value, updated_by, reason, updated_at
     FROM system_runtime_flags
     WHERE flag_key = ANY($1::text[])
     ORDER BY flag_key ASC`,
    [managedFlagKeys],
  );
  const map = new Map(r.rows.map((row) => [row.flag_key, row]));
  const snapshot = {
    whatsapp_send_disabled: map.get("whatsapp_send_disabled")?.flag_value === "on" || false,
    ai_autoreply_disabled: map.get("ai_autoreply_disabled")?.flag_value === "on" || false,
    auto_booking_disabled: map.get("auto_booking_disabled")?.flag_value === "on" || false,
    emergency_global_disable: map.get("emergency_global_disable")?.flag_value === "on" || false,
  };
  return {
    ...snapshot,
    emergency_mode:
      snapshot.whatsapp_send_disabled &&
      snapshot.ai_autoreply_disabled &&
      snapshot.auto_booking_disabled &&
      snapshot.emergency_global_disable,
    rows: r.rows,
  };
}

export async function setRuntimeFlag(args: {
  pool: Pool;
  clinicId?: number | null;
  actorUserId: string;
  flagKey: RuntimeFlagKey;
  enabled: boolean;
  reason: string;
  requestId?: string | null;
}) {
  const flagValue = args.enabled ? "on" : "off";
  await args.pool.query(
    `INSERT INTO system_runtime_flags (flag_key, flag_value, updated_by, reason, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (flag_key)
     DO UPDATE SET flag_value = EXCLUDED.flag_value,
                   updated_by = EXCLUDED.updated_by,
                   reason = EXCLUDED.reason,
                   updated_at = NOW()`,
    [args.flagKey, flagValue, args.actorUserId, args.reason.slice(0, 500)],
  );
  cache.delete(args.flagKey);
  await insertAuditLog(args.pool, {
    clinicId: args.clinicId ?? null,
    actorType: "staff_user",
    actorId: args.actorUserId,
    action: "system.emergency.flag_toggle",
    entityType: "system_runtime_flags",
    entityId: args.flagKey,
    payload: {
      flag_key: args.flagKey,
      enabled: args.enabled,
      reason: args.reason,
      request_id: args.requestId ?? null,
    },
  });
  await writeStructuredLog({
    level: "warn",
    eventName: "system.emergency.flag_toggle",
    requestId: args.requestId ?? null,
    clinicId: args.clinicId ?? null,
    userId: Number(args.actorUserId) || null,
    entityId: args.flagKey,
    message: `Emergency flag ${args.flagKey} set to ${flagValue}`,
    payload: { flag_key: args.flagKey, enabled: args.enabled, reason: args.reason },
  });
}

export async function setEmergencyMode(args: {
  pool: Pool;
  clinicId?: number | null;
  actorUserId: string;
  enabled: boolean;
  reason: string;
  requestId?: string | null;
}) {
  const entries: Array<{ key: RuntimeFlagKey; enabled: boolean }> = [
    { key: "whatsapp_send_disabled", enabled: args.enabled },
    { key: "ai_autoreply_disabled", enabled: args.enabled },
    { key: "auto_booking_disabled", enabled: args.enabled },
    { key: "emergency_global_disable", enabled: args.enabled },
  ];
  for (const entry of entries) {
    await setRuntimeFlag({
      pool: args.pool,
      clinicId: args.clinicId ?? null,
      actorUserId: args.actorUserId,
      flagKey: entry.key,
      enabled: entry.enabled,
      reason: args.reason,
      requestId: args.requestId ?? null,
    });
  }
  if (args.enabled) {
    await captureEmergencySnapshot({
      pool: args.pool,
      actorUserId: args.actorUserId,
      reason: args.reason,
      clinicId: args.clinicId ?? null,
      requestId: args.requestId ?? null,
    });
  }
}

export async function captureEmergencySnapshot(args: {
  pool: Pool;
  actorUserId: string;
  reason: string;
  clinicId?: number | null;
  requestId?: string | null;
}) {
  const [health, queues, failures, errors, snapshot] = await Promise.all([
    args.pool.query(`SELECT 1 AS db_ok`),
    args.pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM core_outbox WHERE status='pending') AS outbox_pending,
        (SELECT COUNT(*)::int FROM core_outbox WHERE status='blocked') AS outbox_blocked,
        (SELECT COUNT(*)::int FROM dead_letter_events) AS dead_letter_events,
        (SELECT COUNT(*)::int FROM system_jobs WHERE status='queued') AS jobs_queued,
        (SELECT COUNT(*)::int FROM system_jobs WHERE status='retrying') AS jobs_retrying,
        (SELECT COUNT(*)::int FROM system_jobs WHERE status='failed_dead') AS jobs_dead`,
    ),
    args.pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM billing_processed_events WHERE status='failed' AND processed_at >= NOW() - interval '24 hours') AS webhook_failures_24h,
        (SELECT COUNT(*)::int FROM billing_reminder_runs WHERE status='failed' AND started_at >= NOW() - interval '24 hours') AS reminder_failures_24h,
        (SELECT COUNT(*)::int FROM core_outbox WHERE status='failed' AND updated_at >= NOW() - interval '24 hours') AS messaging_failures_24h,
        (SELECT COUNT(*)::int FROM system_jobs WHERE status='failed_dead' AND updated_at >= NOW() - interval '24 hours') AS dead_jobs_24h`,
    ),
    args.pool.query(
      `SELECT fingerprint, severity, occurrences
       FROM error_aggregations
       ORDER BY last_seen_at DESC
       LIMIT 10`,
    ),
    readEmergencyModeSnapshot(args.pool),
  ]);

  const healthPayload = { db_ok: Boolean(health.rows[0]?.db_ok) };
  const queuePayload = queues.rows[0] || {};
  const failurePayload = failures.rows[0] || {};
  const errorPayload = errors.rows || [];
  await args.pool.query(
    `INSERT INTO emergency_incident_snapshots
      (activated_by, reason, emergency_state, health, queues, failures, errors)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)`,
    [
      args.actorUserId,
      args.reason.slice(0, 500),
      JSON.stringify({
        emergency_mode: snapshot.emergency_mode,
        whatsapp_send_disabled: snapshot.whatsapp_send_disabled,
        ai_autoreply_disabled: snapshot.ai_autoreply_disabled,
        auto_booking_disabled: snapshot.auto_booking_disabled,
        emergency_global_disable: snapshot.emergency_global_disable,
      }),
      JSON.stringify(healthPayload),
      JSON.stringify(queuePayload),
      JSON.stringify(failurePayload),
      JSON.stringify(errorPayload),
    ],
  );

  await writeStructuredLog({
    level: "warn",
    eventName: "system.emergency.snapshot_created",
    requestId: args.requestId ?? null,
    clinicId: args.clinicId ?? null,
    userId: Number(args.actorUserId) || null,
    message: "Emergency snapshot captured",
    payload: {
      reason: args.reason,
      queues: queuePayload,
      failures: failurePayload,
    },
  });
}

export async function readLatestEmergencySnapshot(pool: Pool) {
  const r = await pool.query(
    `SELECT id, activated_by, reason, emergency_state, health, queues, failures, errors, created_at
     FROM emergency_incident_snapshots
     ORDER BY created_at DESC
     LIMIT 1`,
  );
  return r.rows[0] || null;
}

