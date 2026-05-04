import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";

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

const querySchema = z.object({
  status: z.enum(["pending", "approved", "executed", "cancelled"]).optional(),
  clinic_id: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  limit: z.coerce.number().int().min(1).max(200).optional().default(80),
});

const createBody = z
  .object({
    clinic_id: z.number().int().positive().optional(),
    incident_id: z.number().int().positive().optional(),
    decision_type: z.string().min(3).max(120),
    trigger_source: z.string().min(2).max(80).default("manual"),
    context: z.record(z.unknown()).optional().default({}),
  })
  .strict();

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  const permDenied = await requirePerm(req, "decision.read");
  if (permDenied) return permDenied;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    clinic_id: url.searchParams.get("clinic_id") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query", details: parsed.error.flatten() }, { status: 400 });

  const q = parsed.data;
  const pool = getPool();
  const rows = await pool.query(
    `SELECT d.id, d.decision_type, d.trigger_source, d.clinic_id, c.name AS clinic_name, d.incident_id,
            d.status, d.requested_by, d.approved_by, d.approved_at, d.executed_at, d.created_at, d.updated_at, d.context
       FROM platform_decisions d
       LEFT JOIN clinics c ON c.id = d.clinic_id
      WHERE ($1::int = 0 OR d.clinic_id = $1)
        AND ($2::text IS NULL OR d.status = $2)
      ORDER BY d.created_at DESC
      LIMIT $3`,
    [q.clinic_id, q.status ?? null, q.limit],
  );
  return NextResponse.json({ ok: true, decisions: rows.rows });
}

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  const permDenied = await requirePerm(req, "decision.write");
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
  const ins = await pool.query(
    `INSERT INTO platform_decisions (decision_type, trigger_source, clinic_id, incident_id, status, requested_by, context)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6::jsonb)
     RETURNING id`,
    [b.decision_type, b.trigger_source, b.clinic_id ?? null, b.incident_id ?? null, actor, JSON.stringify(b.context ?? {})],
  );
  const decisionId = Number(ins.rows[0]?.id || 0);
  if (decisionId) {
    await insertAuditLog(pool, {
      clinicId: b.clinic_id ?? null,
      actorType: "staff",
      actorId: actor ? String(actor) : null,
      action: "platform.decision.created",
      entityType: "platform_decision",
      entityId: String(decisionId),
      payload: { decision_type: b.decision_type, trigger_source: b.trigger_source, incident_id: b.incident_id ?? null },
    }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, decision_id: decisionId }, { status: 201 });
}

