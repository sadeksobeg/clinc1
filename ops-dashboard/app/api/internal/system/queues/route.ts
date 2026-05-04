import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const pool = getPool();
  const [outbox, blocked, dead, jobsQueued, jobsRetrying, jobsDead] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM core_outbox WHERE status = 'pending'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM core_outbox WHERE status = 'blocked'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM dead_letter_events`),
    pool.query(`SELECT COUNT(*)::int AS c FROM system_jobs WHERE status = 'queued'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM system_jobs WHERE status = 'retrying'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM system_jobs WHERE status = 'failed_dead'`),
  ]);
  return NextResponse.json({
    ok: true,
    queues: {
      outbox_pending: Number(outbox.rows[0]?.c || 0),
      outbox_blocked: Number(blocked.rows[0]?.c || 0),
      dead_letter_events: Number(dead.rows[0]?.c || 0),
      jobs_queued: Number(jobsQueued.rows[0]?.c || 0),
      jobs_retrying: Number(jobsRetrying.rows[0]?.c || 0),
      jobs_dead: Number(jobsDead.rows[0]?.c || 0),
    },
  });
}
