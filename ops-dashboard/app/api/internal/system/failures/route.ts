import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const pool = getPool();
  const [webhooks, reminders, failedOutbox, deadJobs] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS c
       FROM billing_processed_events
       WHERE status = 'failed'
         AND processed_at >= NOW() - interval '24 hours'`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c
       FROM billing_reminder_runs
       WHERE status = 'failed'
         AND started_at >= NOW() - interval '24 hours'`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c
       FROM core_outbox
       WHERE status = 'failed'
         AND updated_at >= NOW() - interval '24 hours'`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c
       FROM system_jobs
       WHERE status = 'failed_dead'
         AND updated_at >= NOW() - interval '24 hours'`,
    ),
  ]);
  return NextResponse.json({
    ok: true,
    failures: {
      webhook_failures_24h: Number(webhooks.rows[0]?.c || 0),
      reminder_failures_24h: Number(reminders.rows[0]?.c || 0),
      messaging_failures_24h: Number(failedOutbox.rows[0]?.c || 0),
      dead_jobs_24h: Number(deadJobs.rows[0]?.c || 0),
    },
  });
}
