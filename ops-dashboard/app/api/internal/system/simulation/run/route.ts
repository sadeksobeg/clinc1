import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

const schema = z.object({
  scenario_name: z.string().min(3).max(120).default("default_soft_launch"),
  drill_type: z
    .enum([
      "none",
      "db_degraded",
      "whatsapp_failure_spike",
      "billing_failure_spike",
      "dead_jobs_spike",
      "load_burst",
    ])
    .default("none"),
  clinics: z.number().int().min(1).max(1000).default(50),
  conversations_per_day: z.number().int().min(10).max(100000).default(500),
});

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  const pool = getPool();
  const run = await pool.query<{ id: number }>(
    `INSERT INTO production_simulation_runs (scenario_name, status, config, metrics)
     VALUES ($1, 'running', $2::jsonb, '{}'::jsonb)
     RETURNING id`,
    [parsed.data.scenario_name, JSON.stringify(parsed.data)],
  );
  const runId = Number(run.rows[0]?.id || 0);
  const [health, queue, failures, support, deadJobs] = await Promise.all([
    pool.query(`SELECT 1 AS ok`),
    pool.query(`SELECT COUNT(*)::int AS c FROM core_outbox WHERE status IN ('pending','blocked')`),
    pool.query(`SELECT COUNT(*)::int AS c FROM billing_processed_events WHERE status = 'failed' AND processed_at >= NOW() - interval '24 hours'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM support_tickets WHERE status IN ('open','assigned','escalated')`),
    pool.query(`SELECT COUNT(*)::int AS c FROM system_jobs WHERE status = 'failed_dead' AND updated_at >= NOW() - interval '24 hours'`),
  ]);
  const simulatedDailyVolume = parsed.data.clinics * Math.ceil(parsed.data.conversations_per_day / 30);
  let simulated_p99_ms = 180 + Math.min(2200, Math.floor(parsed.data.conversations_per_day / 80));
  const metrics = {
    db_ok: Boolean(health.rows[0]?.ok),
    outbox_backlog: Number(queue.rows[0]?.c || 0),
    webhook_failures_24h: Number(failures.rows[0]?.c || 0),
    dead_jobs_24h: Number(deadJobs.rows[0]?.c || 0),
    open_support_tickets: Number(support.rows[0]?.c || 0),
    simulated_clinics: parsed.data.clinics,
    simulated_conversations_per_day: parsed.data.conversations_per_day,
    drill_type: parsed.data.drill_type,
    simulated_daily_messages: simulatedDailyVolume,
    simulated_p99_ms,
  };
  if (parsed.data.drill_type === "db_degraded") metrics.db_ok = false;
  if (parsed.data.drill_type === "whatsapp_failure_spike") metrics.outbox_backlog = Math.max(metrics.outbox_backlog, 1200);
  if (parsed.data.drill_type === "billing_failure_spike") metrics.webhook_failures_24h = Math.max(metrics.webhook_failures_24h, 200);
  if (parsed.data.drill_type === "dead_jobs_spike") metrics.dead_jobs_24h = Math.max(metrics.dead_jobs_24h, 150);
  if (parsed.data.drill_type === "load_burst") {
    metrics.outbox_backlog = Math.max(metrics.outbox_backlog, 6200);
    metrics.simulated_p99_ms = Math.max(metrics.simulated_p99_ms, 3200);
    metrics.simulated_daily_messages = Math.max(metrics.simulated_daily_messages, 8000);
  }
  const checks = {
    db_ok: metrics.db_ok ? "PASS" : "FAIL",
    outbox_backlog: metrics.outbox_backlog < 5000 ? "PASS" : "FAIL",
    webhook_failures_24h: metrics.webhook_failures_24h < 100 ? "PASS" : "FAIL",
    dead_jobs_24h: metrics.dead_jobs_24h < 50 ? "PASS" : "FAIL",
    slo_p99_ms: metrics.simulated_p99_ms <= 2500 ? "PASS" : "FAIL",
    daily_volume: metrics.simulated_daily_messages <= 50_000 ? "PASS" : "FAIL",
  } as const;
  const passed =
    metrics.db_ok &&
    metrics.outbox_backlog < 5000 &&
    metrics.webhook_failures_24h < 100 &&
    metrics.dead_jobs_24h < 50 &&
    checks.slo_p99_ms === "PASS" &&
    checks.daily_volume === "PASS";
  await pool.query(
    `UPDATE production_simulation_runs
     SET status = $2,
         metrics = $3::jsonb,
         ended_at = NOW()
     WHERE id = $1`,
    [runId, passed ? "passed" : "failed", JSON.stringify({ ...metrics, checks })],
  );
  return NextResponse.json({ ok: true, run_id: runId, status: passed ? "passed" : "failed", metrics, checks });
}
