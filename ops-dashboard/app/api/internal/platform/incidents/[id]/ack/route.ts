import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";
import { writeStructuredLog } from "@/lib/observability/trace";

type Ctx = { params: { id: string } };

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

export async function POST(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  const permDenied = await requirePerm(req, "incidents.write");
  if (permDenied) return permDenied;

  const id = Number(ctx.params.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  const actor = readActor(req);

  const pool = getPool();
  const out = await pool.query(
    `UPDATE platform_incidents
        SET status = CASE WHEN status = 'resolved' THEN status ELSE 'acknowledged' END,
            acknowledged_by = COALESCE(acknowledged_by, $2),
            acknowledged_at = COALESCE(acknowledged_at, NOW()),
            updated_at = NOW()
      WHERE id = $1
      RETURNING id, clinic_id, title, severity, status, acknowledged_by, acknowledged_at, updated_at`,
    [id, actor],
  );
  if (!out.rowCount) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  await pool.query(
    `INSERT INTO platform_incident_events (incident_id, event_type, actor_user_id, payload)
     VALUES ($1, 'acknowledged', $2, $3::jsonb)`,
    [id, actor, JSON.stringify({})],
  );
  const clinicId = out.rows[0]?.clinic_id as number | null | undefined;
  await insertAuditLog(pool, {
    clinicId: clinicId ?? null,
    actorType: "staff",
    actorId: actor ? String(actor) : null,
    action: "platform.incident.acknowledged",
    entityType: "platform_incident",
    entityId: String(id),
    payload: {},
  }).catch(() => undefined);

  await writeStructuredLog({
    level: "info",
    eventName: "platform.incident.acknowledged",
    requestId: req.headers.get("x-request-id"),
    traceId: req.headers.get("x-trace-id"),
    clinicId: clinicId ?? null,
    userId: actor ?? undefined,
    entityId: String(id),
    payload: { severity: String(out.rows[0]?.severity || ""), title: String(out.rows[0]?.title || "") },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, incident: out.rows[0] });
}

