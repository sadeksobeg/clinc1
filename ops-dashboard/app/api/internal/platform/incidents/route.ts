import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";

function readActor(req: Request): number | null {
  const v = Number(req.headers.get("x-user-id") || 0);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function ensurePlatformScope(req: Request): NextResponse | null {
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  return null;
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

const listQuery = z.object({
  clinic_id: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  status: z.enum(["open", "acknowledged", "assigned", "resolved"]).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(80),
});

const createBody = z
  .object({
    clinic_id: z.number().int().positive().optional(),
    title: z.string().min(3).max(300),
    description: z.string().max(4000).optional(),
    severity: z.enum(["info", "warning", "critical"]).optional().default("warning"),
    dedupe_key: z.string().max(200).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const scopeDenied = ensurePlatformScope(req);
  if (scopeDenied) return scopeDenied;
  const permDenied = await requirePerm(req, "incidents.read");
  if (permDenied) return permDenied;

  const url = new URL(req.url);
  const parsed = listQuery.safeParse({
    clinic_id: url.searchParams.get("clinic_id") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query", details: parsed.error.flatten() }, { status: 400 });

  const q = parsed.data;
  const pool = getPool();
  const rows = await pool.query(
    `SELECT i.id, i.clinic_id, c.name AS clinic_name, i.title, i.description, i.severity, i.status, i.source,
            i.created_by, i.acknowledged_by, i.assigned_to, i.resolved_by,
            i.acknowledged_at, i.assigned_at, i.resolved_at, i.created_at, i.updated_at, i.metadata
       FROM platform_incidents i
       LEFT JOIN clinics c ON c.id = i.clinic_id
      WHERE ($1::int = 0 OR i.clinic_id = $1)
        AND ($2::text IS NULL OR i.status = $2)
        AND ($3::text IS NULL OR i.severity = $3)
      ORDER BY i.created_at DESC
      LIMIT $4`,
    [q.clinic_id, q.status ?? null, q.severity ?? null, q.limit],
  );

  return NextResponse.json({ ok: true, incidents: rows.rows });
}

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const scopeDenied = ensurePlatformScope(req);
  if (scopeDenied) return scopeDenied;
  const permDenied = await requirePerm(req, "incidents.write");
  if (permDenied) return permDenied;

  const actor = readActor(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = createBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const pool = getPool();
  const b = parsed.data;
  const created = await pool.query(
    `INSERT INTO platform_incidents
      (clinic_id, title, description, severity, status, source, dedupe_key, created_by, metadata)
     VALUES ($1, $2, $3, $4, 'open', 'platform', $5, $6, $7::jsonb)
     RETURNING id, clinic_id, title, description, severity, status, source, dedupe_key, created_by, created_at, updated_at, metadata`,
    [b.clinic_id ?? null, b.title, b.description ?? null, b.severity, b.dedupe_key ?? null, actor, JSON.stringify(b.metadata ?? {})],
  );
  const incidentId = Number(created.rows[0]?.id || 0);
  if (incidentId) {
    await pool.query(
      `INSERT INTO platform_incident_events (incident_id, event_type, actor_user_id, payload)
       VALUES ($1, 'created', $2, $3::jsonb)`,
      [incidentId, actor, JSON.stringify({})],
    );
    await insertAuditLog(pool, {
      clinicId: b.clinic_id ?? null,
      actorType: "staff",
      actorId: actor ? String(actor) : null,
      action: "platform.incident.created",
      entityType: "platform_incident",
      entityId: String(incidentId),
      payload: { severity: b.severity, dedupe_key: b.dedupe_key ?? null },
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, incident: created.rows[0] }, { status: 201 });
}

