import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const limit = Math.min(300, Math.max(20, Number(url.searchParams.get("limit") || "120")));
  const clinicId = Number(req.headers.get("x-clinic-id") || 0);
  const pool = getPool();
  const r = await pool.query(
    `WITH timeline AS (
      SELECT created_at AS ts, 'audit'::text AS source, action AS event_name, payload AS data
      FROM audit_logs
      WHERE ($1::bigint = 0 OR clinic_id = $1)
      UNION ALL
      SELECT created_at AS ts, 'log'::text AS source, event_name,
             jsonb_strip_nulls(
               jsonb_build_object(
                 'request_id', request_id,
                 'trace_id', trace_id,
                 'clinic_id', clinic_id,
                 'user_id', user_id,
                 'job_id', job_id
               ) || payload
             ) AS data
      FROM structured_logs
      WHERE ($1::bigint = 0 OR clinic_id = $1)
      UNION ALL
      SELECT created_at AS ts, 'job'::text AS source, CONCAT('job.', status) AS event_name,
             jsonb_build_object('job_id', id, 'job_type', job_type, 'status', status, 'last_error', last_error) AS data
      FROM system_jobs
      WHERE ($1::bigint = 0 OR clinic_id = $1)
      UNION ALL
      SELECT started_at AS ts, 'billing_reminder'::text AS source, CONCAT('reminder.', status) AS event_name,
             jsonb_build_object('run_id', id, 'sent_count', sent_count, 'failed_count', failed_count, 'error_text', error_text) AS data
      FROM billing_reminder_runs
    )
    SELECT ts, source, event_name, data
    FROM timeline
    ORDER BY ts DESC
    LIMIT $2`,
    [clinicId, limit],
  );
  return NextResponse.json({ ok: true, timeline: r.rows });
}
