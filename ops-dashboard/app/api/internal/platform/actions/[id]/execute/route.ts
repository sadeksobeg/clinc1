import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";
import { requirePlatformPerm } from "@/lib/platform/platformPerms";
import { actionRegistry } from "@/lib/platform/actionRegistry";
import { writeStructuredLog } from "@/lib/observability/trace";

type Ctx = { params: { id: string } };

const bodySchema = z.object({ reason: z.string().min(5).max(500) }).strict();

async function logAction(pool: ReturnType<typeof getPool>, actionId: number, eventType: string, message: string, meta: Record<string, unknown> = {}) {
  await pool.query(
    `INSERT INTO platform_action_logs (action_id, event_type, message, meta)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [actionId, eventType, message, JSON.stringify(meta)],
  );
}

export async function POST(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const perm = await requirePlatformPerm(req, "action.execute");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  const id = Number(ctx.params.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const pool = getPool();
  const startedAt = Date.now();
  const locked = await pool.query(
    `SELECT id, action_type, target_type, target_id, clinic_id, incident_id, decision_id, status, payload
       FROM platform_actions
      WHERE id = $1
      FOR UPDATE`,
    [id],
  );
  const a = locked.rows[0] as any | undefined;
  if (!a) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (String(a.status) !== "pending") return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });

  const reg = actionRegistry[String(a.action_type || "")];
  if (!reg) return NextResponse.json({ ok: false, error: "unknown_action_type" }, { status: 400 });

  // Rate limit (Phase 1): max per hour per action_type.
  const rl = await pool
    .query(`SELECT max_per_hour::int AS max FROM platform_action_rate_limits WHERE action_type = $1 LIMIT 1`, [reg.action_type])
    .then((r) => Number(r.rows[0]?.max || 0))
    .catch(() => 0);
  if (rl > 0) {
    const used = await pool.query(
      `SELECT COUNT(*)::int AS c
         FROM platform_actions
        WHERE action_type = $1
          AND created_at >= NOW() - interval '1 hour'`,
      [reg.action_type],
    );
    if (Number(used.rows[0]?.c || 0) >= rl) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }
  }

  await pool.query(
    `UPDATE platform_actions
        SET status = 'running',
            started_at = NOW(),
            approved_by = COALESCE(approved_by, $2),
            approved_at = COALESCE(approved_at, NOW()),
            updated_at = NOW()
      WHERE id = $1`,
    [id, perm.actor],
  );
  await logAction(pool, id, "started", "Action execution started", { reason: parsed.data.reason, action_type: reg.action_type });

  const actionType = String(a.action_type || "");
  const clinicId = (a.clinic_id as number | null) ?? null;
  await writeStructuredLog({
    level: "info",
    eventName: "platform.action.started",
    requestId: req.headers.get("x-request-id"),
    traceId: req.headers.get("x-trace-id"),
    clinicId,
    userId: perm.actor,
    entityId: String(id),
    payload: { action_type: reg.action_type },
  }).catch(() => undefined);

  try {
    await reg.execute({ req, pool, actionRow: a, reason: parsed.data.reason });

    await pool.query(
      `UPDATE platform_actions
          SET status = 'success',
              finished_at = NOW(),
              updated_at = NOW(),
              error = NULL
        WHERE id = $1`,
      [id],
    );
    await logAction(pool, id, "success", "Action executed successfully", { duration_ms: Date.now() - startedAt });
    await writeStructuredLog({
      level: "info",
      eventName: "platform.action.success",
      requestId: req.headers.get("x-request-id"),
      traceId: req.headers.get("x-trace-id"),
      clinicId,
      userId: perm.actor,
      entityId: String(id),
      payload: { action_type: reg.action_type, duration_ms: Date.now() - startedAt },
    }).catch(() => undefined);
    await insertAuditLog(pool, {
      clinicId,
      actorType: "staff",
      actorId: String(perm.actor),
      action: "platform.action.executed",
      entityType: "platform_action",
      entityId: String(id),
      payload: { action_type: actionType, reason: parsed.data.reason },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "execute_failed";
    const durationMs = Date.now() - startedAt;
    await pool.query(
      `UPDATE platform_actions
          SET status = 'failed',
              finished_at = NOW(),
              updated_at = NOW(),
              error = $2
        WHERE id = $1`,
      [id, msg.slice(0, 500)],
    );
    await logAction(pool, id, "failed", "Action execution failed", { error: msg, duration_ms: durationMs, error_code: "execute_failed" });
    await writeStructuredLog({
      level: "error",
      eventName: "platform.action.failed",
      requestId: req.headers.get("x-request-id"),
      traceId: req.headers.get("x-trace-id"),
      clinicId,
      userId: perm.actor,
      entityId: String(id),
      payload: { action_type: reg.action_type, error: msg, duration_ms: durationMs },
    }).catch(() => undefined);
    await pool.query(`UPDATE platform_action_logs SET duration_ms = $2, error_code = $3 WHERE action_id = $1 AND event_type = 'failed'`, [
      id,
      durationMs,
      "execute_failed",
    ]).catch(() => undefined);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

