import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const clinicId = Number(req.headers.get("x-clinic-id") || 0);
  const pool = getPool();
  const scope = clinicId > 0 ? "AND clinic_id = $1" : "";
  const params: unknown[] = clinicId > 0 ? [clinicId] : [];

  const [summary, workload] = await Promise.all([
    pool.query(
      `SELECT
          COUNT(*)::int AS total_tickets,
          COUNT(*) FILTER (WHERE status IN ('open','assigned','escalated'))::int AS open_tickets,
          COUNT(*) FILTER (WHERE support_breach_flag = TRUE)::int AS breached_tickets,
          AVG(EXTRACT(EPOCH FROM (COALESCE(support_first_response_at, NOW()) - created_at)))::float AS first_response_seconds_avg,
          AVG(EXTRACT(EPOCH FROM (COALESCE(support_resolved_at, NOW()) - created_at)))::float AS resolution_seconds_avg
       FROM support_tickets
       WHERE 1=1 ${scope}`,
      params,
    ),
    pool.query(
      `SELECT COALESCE(assigned_to, 0) AS agent_id,
              COUNT(*) FILTER (WHERE status IN ('open','assigned','escalated'))::int AS open_tickets
       FROM support_tickets
       WHERE 1=1 ${scope}
       GROUP BY COALESCE(assigned_to, 0)
       ORDER BY open_tickets DESC`,
      params,
    ),
  ]);

  const s = summary.rows[0] as Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    analytics: {
      total_tickets: Number(s.total_tickets || 0),
      open_tickets: Number(s.open_tickets || 0),
      breached_tickets: Number(s.breached_tickets || 0),
      breach_rate: Number(s.total_tickets || 0) > 0 ? Number((Number(s.breached_tickets || 0) / Number(s.total_tickets || 1)).toFixed(4)) : 0,
      first_response_seconds_avg: Math.round(Number(s.first_response_seconds_avg || 0)),
      resolution_seconds_avg: Math.round(Number(s.resolution_seconds_avg || 0)),
      workload: workload.rows,
    },
  });
}
