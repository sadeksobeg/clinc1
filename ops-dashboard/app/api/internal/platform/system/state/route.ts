import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

function readActor(req: Request): number | null {
  const v = Number(req.headers.get("x-user-id") || 0);
  return Number.isFinite(v) && v > 0 ? v : null;
}

async function requirePerm(req: Request, perm: string): Promise<NextResponse | null> {
  const actor = readActor(req);
  if (!actor) return NextResponse.json({ ok: false, error: "missing_actor" }, { status: 400 });
  const pool = getPool();
  const r = await pool.query(`SELECT role, security_flags FROM staff_users WHERE id=$1 AND deleted_at IS NULL LIMIT 1`, [actor]);
  const row = r.rows[0] as { role: string; security_flags?: Record<string, unknown> } | undefined;
  if (!row) return NextResponse.json({ ok: false, error: "actor_not_found" }, { status: 403 });
  if (String(row.role || "").toLowerCase() === "super_admin") return null;
  const perms = Array.isArray((row.security_flags as any)?.platform_perms) ? ((row.security_flags as any).platform_perms as unknown[]) : [];
  const has = perms.map((x) => String(x)).includes(perm);
  if (!has) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  return null;
}

function clampInt(n: number, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  const permDenied = await requirePerm(req, "system.read");
  if (permDenied) return permDenied;

  const pool = getPool();
  const url = new URL(req.url);
  const refresh = String(url.searchParams.get("refresh") || "") === "1";
  const ttlMs = clampInt(Number(url.searchParams.get("ttl_ms") || 20_000), 5_000, 300_000);

  // Read cached singleton.
  const current = await pool.query(
    `SELECT id, global_status, severity, active_incidents_count, critical_incidents_count, affected_clinics_count,
            components, signals, last_evaluated_at, updated_at
       FROM platform_system_state
      WHERE id = 1
      LIMIT 1`,
  );
  const row = current.rows[0] as any | undefined;
  const ageMs = row?.last_evaluated_at ? Date.now() - new Date(row.last_evaluated_at).getTime() : Number.POSITIVE_INFINITY;

  if (!refresh && row && ageMs <= ttlMs) {
    return NextResponse.json({ ok: true, cached: true, age_ms: ageMs, state: row });
  }

  // Compute quick state from existing signals.
  const [health, failures, incidentCounts] = await Promise.all([
    fetch(new URL("/api/internal/system/health", req.url), { headers: req.headers, cache: "no-store" }).then((r) => r.json()).catch(() => null),
    fetch(new URL("/api/internal/system/failures", req.url), { headers: req.headers, cache: "no-store" }).then((r) => r.json()).catch(() => null),
    pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE status IN ('open','acknowledged','assigned'))::int AS active_count,
          COUNT(*) FILTER (WHERE status IN ('open','acknowledged','assigned') AND severity = 'critical')::int AS critical_active
       FROM platform_incidents`,
    ),
  ]);

  const h = (health && health.ok === true ? (health.health as any) : {}) as any;
  const f = (failures && failures.ok === true ? (failures.failures as any) : {}) as any;
  const activeInc = Number(incidentCounts.rows[0]?.active_count || 0);
  const criticalInc = Number(incidentCounts.rows[0]?.critical_active || 0);

  const dbOk = h?.db_ok !== false;
  const dbLatency = Number(h?.db_latency_ms || 0);
  const webhookFailures = Number(f?.webhook_failures_24h || 0);
  const deadJobs = Number(f?.dead_jobs_24h || 0);
  const waDisabled = Boolean(h?.whatsapp_send_runtime_disabled);

  let severity = 0;
  if (!dbOk) severity = Math.max(severity, 3);
  if (criticalInc > 0) severity = Math.max(severity, 3);
  if (waDisabled) severity = Math.max(severity, 2);
  if (dbLatency > 800) severity = Math.max(severity, 2);
  if (webhookFailures > 0 || deadJobs > 0 || activeInc > 0) severity = Math.max(severity, 1);

  const globalStatus = severity >= 3 ? "incident" : severity >= 1 ? "degraded" : "healthy";

  const components = {
    db: !dbOk ? "down" : dbLatency > 800 ? "degraded" : "healthy",
    whatsapp: waDisabled ? "degraded" : "healthy",
    billing: webhookFailures > 0 ? "degraded" : "healthy",
    jobs: deadJobs > 0 ? "degraded" : "healthy",
  };

  const signals = {
    health: h,
    failures: f,
  };

  const updated = await pool.query(
    `UPDATE platform_system_state
        SET global_status = $1,
            severity = $2,
            active_incidents_count = $3,
            critical_incidents_count = $4,
            affected_clinics_count = $5,
            components = $6::jsonb,
            signals = $7::jsonb,
            last_evaluated_at = NOW(),
            updated_at = NOW()
      WHERE id = 1
      RETURNING id, global_status, severity, active_incidents_count, critical_incidents_count, affected_clinics_count,
                components, signals, last_evaluated_at, updated_at`,
    [globalStatus, severity, activeInc, criticalInc, 0, JSON.stringify(components), JSON.stringify(signals)],
  );

  return NextResponse.json({ ok: true, cached: false, state: updated.rows[0] });
}

