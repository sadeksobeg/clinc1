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

  const permDenied = await requirePerm(req, "clinic.read");
  if (permDenied) return permDenied;

  const url = new URL(req.url);
  const windowMinutes = clampInt(Number(url.searchParams.get("window_minutes") || 5), 1, 60);

  const pool = getPool();
  const r = await pool.query(
    `
    SELECT
      c.id::bigint AS clinic_id,
      MAX(us.last_seen_at) AS last_seen_at,
      BOOL_OR(
        us.revoked_at IS NULL
        AND us.last_seen_at >= (NOW() - ($1::text || ' minutes')::interval)
      ) AS online
    FROM clinics c
    LEFT JOIN staff_users su
      ON su.clinic_id = c.id
     AND su.deleted_at IS NULL
     AND su.is_active = TRUE
    LEFT JOIN user_sessions us
      ON us.user_id = su.id
    WHERE c.deleted_at IS NULL
    GROUP BY c.id
    ORDER BY c.id ASC
    `,
    [String(windowMinutes)],
  );

  const rows = (r.rows ?? []).map((x: any) => ({
    clinic_id: Number(x.clinic_id || 0),
    online: Boolean(x.online),
    last_seen_at: x.last_seen_at ? new Date(x.last_seen_at).toISOString() : null,
  }));

  return NextResponse.json({ ok: true, window_minutes: windowMinutes, clinics: rows });
}

