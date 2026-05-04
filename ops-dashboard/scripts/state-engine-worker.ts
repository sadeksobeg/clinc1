/**
 * P12.4 State Engine Worker (v2)
 *
 * Computes platform state intelligence and persists:
 * - platform_component_states
 * - platform_system_state (singleton id=1)
 *
 * Run:
 *   npm run db:apply-scheduling
 *   npm run worker:state-engine
 *
 * Env:
 *   DATABASE_URL
 *   STATE_ENGINE_INTERVAL_MS (default 30000)
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("./load-ops-env.cjs");

import { getPool } from "../lib/db";

function intervalMs(): number {
  const n = Number(process.env.STATE_ENGINE_INTERVAL_MS || 30_000);
  return Number.isFinite(n) && n >= 5_000 && n <= 300_000 ? Math.floor(n) : 30_000;
}

type ComponentStatus = "healthy" | "degraded" | "down";

function clampInt(n: unknown, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function confidenceFromSignals(signalCount: number): number {
  if (signalCount >= 3) return 0.9;
  if (signalCount === 2) return 0.65;
  if (signalCount === 1) return 0.4;
  return 0.25;
}

async function computeOnce(): Promise<void> {
  const pool = getPool();
  const startedAt = Date.now();

  const [healthR, failuresR, queuesR, incR] = await Promise.all([
    pool.query(`SELECT 1 AS ok`).then(async () => {
      const started = Date.now();
      const ping = await pool.query("SELECT 1 AS ok");
      return { ok: true, db_ok: Boolean(ping.rows[0]?.ok), db_latency_ms: Date.now() - started };
    }).catch(() => ({ ok: false })),
    pool
      .query(
        `SELECT
          (SELECT COUNT(*)::int FROM billing_processed_events WHERE status='failed' AND processed_at >= NOW() - interval '24 hours') AS webhook_failures_24h,
          (SELECT COUNT(*)::int FROM system_jobs WHERE status='failed_dead' AND updated_at >= NOW() - interval '24 hours') AS dead_jobs_24h`,
      )
      .then((r) => ({ ok: true, ...r.rows[0] }))
      .catch(() => ({ ok: false })),
    pool
      .query(
        `SELECT
          (SELECT COUNT(*)::int FROM core_outbox WHERE status='blocked') AS outbox_blocked,
          (SELECT COUNT(*)::int FROM system_jobs WHERE status='failed_dead') AS jobs_dead`,
      )
      .then((r) => ({ ok: true, ...r.rows[0] }))
      .catch(() => ({ ok: false })),
    pool
      .query(
        `SELECT
          COUNT(*) FILTER (WHERE status IN ('open','acknowledged','assigned'))::int AS active_count,
          COUNT(*) FILTER (WHERE status IN ('open','acknowledged','assigned') AND severity = 'critical')::int AS critical_active
         FROM platform_incidents`,
      )
      .then((r) => ({ ok: true, ...r.rows[0] }))
      .catch(() => ({ ok: false })),
  ]);

  const dbOk = healthR.ok ? (healthR as any).db_ok !== false : false;
  const dbLatency = clampInt((healthR as any).db_latency_ms, 0, 1_000_000);
  const webhookFailures = clampInt((failuresR as any).webhook_failures_24h, 0, 1_000_000);
  const deadJobs24h = clampInt((failuresR as any).dead_jobs_24h, 0, 1_000_000);
  const jobsDead = clampInt((queuesR as any).jobs_dead, 0, 1_000_000);
  const outboxBlocked = clampInt((queuesR as any).outbox_blocked, 0, 1_000_000);
  const activeInc = clampInt((incR as any).active_count, 0, 1_000_000);
  const criticalInc = clampInt((incR as any).critical_active, 0, 1_000_000);

  // Component statuses (best-effort).
  const compDb: ComponentStatus = !dbOk ? "down" : dbLatency > 800 ? "degraded" : "healthy";
  const compBilling: ComponentStatus = webhookFailures > 0 ? "degraded" : "healthy";
  const compJobs: ComponentStatus = jobsDead > 0 || deadJobs24h > 0 ? "degraded" : "healthy";
  const compMessaging: ComponentStatus = outboxBlocked > 0 ? "degraded" : "healthy";

  // Impact & confidence (simple v1 formulas).
  const userImpact =
    clampInt((dbLatency / 5) * 1, 0, 200) +
    clampInt(webhookFailures * 2, 0, 200) +
    clampInt(outboxBlocked * 2, 0, 200) +
    clampInt(activeInc * 5, 0, 200);
  const signalCount = Number(!dbOk) + Number(dbLatency > 800) + Number(webhookFailures > 0) + Number(outboxBlocked > 0) + Number(activeInc > 0);
  const confidence = confidenceFromSignals(signalCount);

  const blastR = await pool
    .query(`SELECT COUNT(DISTINCT clinic_id)::int AS c FROM platform_component_clinic_impact WHERE last_failure_at >= NOW() - interval '24 hours'`)
    .then((r) => clampInt(r.rows[0]?.c, 0, 1_000_000))
    .catch(() => 0);

  let severity = 0;
  if (!dbOk) severity = Math.max(severity, 3);
  if (criticalInc > 0) severity = Math.max(severity, 3);
  if (dbLatency > 800 || outboxBlocked > 0) severity = Math.max(severity, 2);
  if (webhookFailures > 0 || deadJobs24h > 0 || activeInc > 0) severity = Math.max(severity, 1);

  const globalStatus = severity >= 3 ? "incident" : severity >= 1 ? "degraded" : "healthy";

  const components = { db: compDb, billing: compBilling, jobs: compJobs, messaging: compMessaging };
  const signalSources = {
    health: { db_ok: dbOk, db_latency_ms: dbLatency },
    failures: { webhook_failures_24h: webhookFailures, dead_jobs_24h: deadJobs24h },
    queues: { outbox_blocked: outboxBlocked, jobs_dead: jobsDead },
    incidents: { active: activeInc, critical: criticalInc },
  };

  await pool.query(
    `INSERT INTO platform_component_states (component_key, status, severity, latency_ms, source, details, signal_sources, confidence, impact_score, updated_at)
     VALUES
      ('db', $1, $5, $9, 'computed', $13::jsonb, $14::jsonb, $15, $16, NOW()),
      ('billing', $2, $6, NULL, 'computed', $13::jsonb, $14::jsonb, $15, $16, NOW()),
      ('jobs', $3, $7, NULL, 'computed', $13::jsonb, $14::jsonb, $15, $16, NOW()),
      ('messaging', $4, $8, NULL, 'computed', $13::jsonb, $14::jsonb, $15, $16, NOW())
     ON CONFLICT (component_key)
     DO UPDATE SET status=EXCLUDED.status, severity=EXCLUDED.severity, latency_ms=EXCLUDED.latency_ms, source=EXCLUDED.source,
                   details=EXCLUDED.details, signal_sources=EXCLUDED.signal_sources, confidence=EXCLUDED.confidence, impact_score=EXCLUDED.impact_score,
                   updated_at=NOW()`,
    [
      compDb,
      compBilling,
      compJobs,
      compMessaging,
      severity,
      compBilling === "healthy" ? 0 : 1,
      compJobs === "healthy" ? 0 : 1,
      compMessaging === "healthy" ? 0 : 1,
      dbLatency,
      JSON.stringify({ computed_at: new Date().toISOString() }),
      JSON.stringify({}),
      JSON.stringify({ components, signals: signalSources }),
      JSON.stringify(signalSources),
      confidence,
      userImpact,
    ],
  );

  await pool.query(
    `UPDATE platform_system_state
        SET global_status=$1,
            severity=$2,
            active_incidents_count=$3,
            critical_incidents_count=$4,
            blast_radius=$5,
            user_impact_score=$6,
            confidence_score=$7,
            primary_cause=$8,
            components=$9::jsonb,
            signals=$10::jsonb,
            last_evaluated_at=NOW(),
            updated_at=NOW()
      WHERE id=1`,
    [
      globalStatus,
      severity,
      activeInc,
      criticalInc,
      blastR,
      clampInt(userImpact, 0, 10_000),
      confidence,
      !dbOk ? "db.down" : criticalInc > 0 ? "incidents.critical" : dbLatency > 800 ? "db.latency" : webhookFailures > 0 ? "billing.webhook" : outboxBlocked > 0 ? "messaging.outbox_blocked" : null,
      JSON.stringify(components),
      JSON.stringify(signalSources),
    ],
  );

  const elapsed = Date.now() - startedAt;
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      component: "state_engine_worker",
      message: "computed",
      global_status: globalStatus,
      severity,
      confidence,
      blast_radius: blastR,
      user_impact_score: userImpact,
      elapsed_ms: elapsed,
    }),
  );
}

async function main(): Promise<void> {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", component: "state_engine_worker", message: "started", interval_ms: intervalMs() }));
  for (;;) {
    await computeOnce().catch((e) => {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          component: "state_engine_worker",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    });
    await new Promise((r) => setTimeout(r, intervalMs()));
  }
}

void main();

