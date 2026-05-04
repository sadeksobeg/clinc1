import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const granularity = (url.searchParams.get("granularity") || "day").toLowerCase();
  const limit = Math.min(500, Math.max(20, Number(url.searchParams.get("limit") || "200")));
  const clinicId = Number(req.headers.get("x-clinic-id") || 0);
  const pool = getPool();
  const r = await pool.query(
    `SELECT clinic_id, granularity, bucket_start, event_name, total_count, unique_sessions, payload, computed_at
     FROM analytics_trial_rollups
     WHERE ($1::bigint = 0 OR clinic_id = $1)
       AND ($2::text = 'all' OR granularity = $2::text)
     ORDER BY bucket_start DESC
     LIMIT $3`,
    [clinicId, granularity === "all" ? "all" : granularity, limit],
  );
  return NextResponse.json({ ok: true, rollups: r.rows });
}
