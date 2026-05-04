import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { requirePlatformPerm } from "@/lib/platform/platformPerms";
import { actionRegistry } from "@/lib/platform/actionRegistry";
import { writeStructuredLog } from "@/lib/observability/trace";

const querySchema = z.object({
  status: z.enum(["pending", "running", "success", "failed", "rolled_back"]).optional(),
  clinic_id: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  limit: z.coerce.number().int().min(1).max(200).optional().default(80),
});

const createSchema = z
  .object({
    action_type: z.string().min(3).max(80),
    target_type: z.string().min(2).max(40),
    target_id: z.number().int().positive().optional(),
    clinic_id: z.number().int().positive().optional(),
    incident_id: z.number().int().positive().optional(),
    decision_id: z.number().int().positive().optional(),
    payload: z.record(z.any()).optional().default({}),
    idempotency_key: z.string().min(8).max(120),
  })
  .strict();

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  const perm = await requirePlatformPerm(req, "action.read");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

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
    `SELECT a.id, a.action_type, a.target_type, a.target_id, a.clinic_id, c.name AS clinic_name, a.incident_id, a.decision_id,
            a.status, a.requested_by, a.approved_by, a.approved_at, a.started_at, a.finished_at, a.error,
            a.risk_level, a.auto_executable, a.rollback_action_id,
            a.created_at, a.updated_at, a.payload
       FROM platform_actions a
       LEFT JOIN clinics c ON c.id = a.clinic_id
      WHERE ($1::int = 0 OR a.clinic_id = $1)
        AND ($2::text IS NULL OR a.status = $2)
      ORDER BY a.created_at DESC
      LIMIT $3`,
    [q.clinic_id, q.status ?? null, q.limit],
  );
  return NextResponse.json({ ok: true, actions: rows.rows });
}

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  const perm = await requirePlatformPerm(req, "action.create");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const reg = actionRegistry[String(parsed.data.action_type)];
  if (!reg) return NextResponse.json({ ok: false, error: "unknown_action_type" }, { status: 400 });

  // Approval matrix hook (Phase 1): if risk_level is critical/high, require action.approve later (not implemented yet).
  const pool = getPool();
  const idempotencyKey = parsed.data.idempotency_key;

  const exists = await pool.query(`SELECT id FROM platform_actions WHERE payload->>'idempotency_key' = $1 ORDER BY id DESC LIMIT 1`, [idempotencyKey]);
  if (exists.rows[0]) return NextResponse.json({ ok: true, action_id: Number(exists.rows[0].id), deduped: true });

  const ins = await pool.query(
    `INSERT INTO platform_actions (action_type, target_type, target_id, clinic_id, incident_id, decision_id, status, requested_by, payload, risk_level, auto_executable)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8::jsonb, $9, $10)
     RETURNING id`,
    [
      reg.action_type,
      parsed.data.target_type,
      parsed.data.target_id ?? null,
      parsed.data.clinic_id ?? null,
      parsed.data.incident_id ?? null,
      parsed.data.decision_id ?? null,
      perm.actor,
      JSON.stringify({ ...(parsed.data.payload || {}), idempotency_key: idempotencyKey }),
      reg.risk_level,
      reg.auto_executable,
    ],
  );
  const actionId = Number(ins.rows[0]?.id || 0);
  if (actionId) {
    await writeStructuredLog({
      level: "info",
      eventName: "platform.action.created",
      requestId: req.headers.get("x-request-id"),
      traceId: req.headers.get("x-trace-id"),
      clinicId: parsed.data.clinic_id ?? null,
      userId: perm.actor,
      entityId: String(actionId),
      payload: { action_type: reg.action_type, target_type: parsed.data.target_type, idempotency_key: idempotencyKey },
    }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, action_id: actionId });
}
