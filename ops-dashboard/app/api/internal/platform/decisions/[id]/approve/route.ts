import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";
import { requirePlatformPerm } from "@/lib/platform/platformPerms";
import { writeStructuredLog } from "@/lib/observability/trace";

type Ctx = { params: { id: string } };

const bodySchema = z.object({ note: z.string().max(2000).optional() }).strict();

export async function POST(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const perm = await requirePlatformPerm(req, "decision.approve");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  const id = Number(ctx.params.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const pool = getPool();
  const out = await pool.query(
    `UPDATE platform_decisions
        SET status = CASE WHEN status = 'pending' THEN 'approved' ELSE status END,
            approved_by = COALESCE(approved_by, $2),
            approved_at = COALESCE(approved_at, NOW()),
            updated_at = NOW()
      WHERE id = $1
      RETURNING id, clinic_id, decision_type, status, approved_by, approved_at, updated_at`,
    [id, perm.actor],
  );
  if (!out.rowCount) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const clinicId = out.rows[0]?.clinic_id as number | null | undefined;
  await insertAuditLog(pool, {
    clinicId: clinicId ?? null,
    actorType: "staff",
    actorId: String(perm.actor),
    action: "platform.decision.approved",
    entityType: "platform_decision",
    entityId: String(id),
    payload: { note: parsed.data.note ?? null },
  }).catch(() => undefined);

  await writeStructuredLog({
    level: "info",
    eventName: "platform.decision.approved",
    requestId: req.headers.get("x-request-id"),
    traceId: req.headers.get("x-trace-id"),
    clinicId: clinicId ?? null,
    userId: perm.actor,
    entityId: String(id),
    payload: { note: parsed.data.note ?? null, decision_type: String(out.rows[0]?.decision_type || "") },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, decision: out.rows[0] });
}

