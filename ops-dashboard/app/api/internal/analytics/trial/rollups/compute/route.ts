import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const pool = getPool();
  const clinicId = Number(req.headers.get("x-clinic-id") || 0);
  const filter = clinicId > 0 ? "AND t.clinic_id = $1" : "";
  const params: unknown[] = clinicId > 0 ? [clinicId] : [];

  const dayUpsert = await pool.query(
    `INSERT INTO analytics_trial_rollups (clinic_id, granularity, bucket_start, event_name, total_count, unique_sessions, payload, computed_at)
     SELECT t.clinic_id,
            'day'::text AS granularity,
            date_trunc('day', t.ts)::timestamptz AS bucket_start,
            t.event,
            COUNT(*)::bigint AS total_count,
            COUNT(DISTINCT t.trial_session_id)::bigint AS unique_sessions,
            jsonb_build_object('from', MIN(t.ts), 'to', MAX(t.ts)) AS payload,
            NOW() AS computed_at
     FROM trial_funnel_events t
     WHERE t.ts >= NOW() - interval '14 days'
     ${filter}
     GROUP BY t.clinic_id, date_trunc('day', t.ts), t.event
     ON CONFLICT (clinic_id, granularity, bucket_start, event_name)
     DO UPDATE SET
       total_count = EXCLUDED.total_count,
       unique_sessions = EXCLUDED.unique_sessions,
       payload = EXCLUDED.payload,
       computed_at = NOW()`,
    params,
  );

  const hourUpsert = await pool.query(
    `INSERT INTO analytics_trial_rollups (clinic_id, granularity, bucket_start, event_name, total_count, unique_sessions, payload, computed_at)
     SELECT t.clinic_id,
            'hour'::text AS granularity,
            date_trunc('hour', t.ts)::timestamptz AS bucket_start,
            t.event,
            COUNT(*)::bigint AS total_count,
            COUNT(DISTINCT t.trial_session_id)::bigint AS unique_sessions,
            jsonb_build_object('from', MIN(t.ts), 'to', MAX(t.ts)) AS payload,
            NOW() AS computed_at
     FROM trial_funnel_events t
     WHERE t.ts >= NOW() - interval '72 hours'
     ${filter}
     GROUP BY t.clinic_id, date_trunc('hour', t.ts), t.event
     ON CONFLICT (clinic_id, granularity, bucket_start, event_name)
     DO UPDATE SET
       total_count = EXCLUDED.total_count,
       unique_sessions = EXCLUDED.unique_sessions,
       payload = EXCLUDED.payload,
       computed_at = NOW()`,
    params,
  );

  return NextResponse.json({
    ok: true,
    result: {
      day_rows: dayUpsert.rowCount || 0,
      hour_rows: hourUpsert.rowCount || 0,
    },
  });
}
