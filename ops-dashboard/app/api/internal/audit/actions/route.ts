import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const u = new URL(req.url);
  const platformScope = req.headers.get("x-platform-scope") === "true";
  const clinicIdRaw = Number.parseInt(u.searchParams.get("clinic_id") || "0", 10) || 0;
  const clinicId = platformScope ? Math.max(0, clinicIdRaw) : Math.max(1, clinicIdRaw || 1);
  const limit = Math.min(200, Math.max(10, Number.parseInt(u.searchParams.get("limit") || "50", 10) || 50));

  try {
    const pool = getPool();
    const logs = await pool.query(
      `SELECT id, clinic_id, actor_type, actor_id, action, entity_type, entity_id, payload, created_at
       FROM audit_logs
       WHERE ($1::int = 0 OR clinic_id = $1)
         AND created_at >= NOW() - interval '14 days'
       ORDER BY created_at DESC
       LIMIT $2`,
      [clinicId, limit],
    );

    const summary = await pool.query(
      `SELECT action,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (
                WHERE payload ? 'ok'
                  AND (
                    payload->>'ok' = 'false'
                    OR lower(payload->>'ok') IN ('f', '0', 'no')
                  )
              )::int AS error_count,
              ROUND(AVG((payload->>'duration_ms')::numeric), 2) AS avg_ms,
              ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY (payload->>'duration_ms')::numeric), 2) AS p50_ms,
              ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY (payload->>'duration_ms')::numeric), 2) AS p95_ms
       FROM audit_logs
       WHERE ($1::int = 0 OR clinic_id = $1)
         AND created_at >= NOW() - interval '24 hours'
         AND payload ? 'duration_ms'
         AND (payload->>'duration_ms') ~ '^[0-9]+(\.[0-9]+)?$'
       GROUP BY action
       ORDER BY p95_ms DESC NULLS LAST, total DESC`,
      [clinicId],
    );

    return NextResponse.json({ ok: true, summary: summary.rows, logs: logs.rows });
  } catch (e) {
    opsLogError("internal/audit/actions", e, { clinic_id: clinicId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
