import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";
import { hasIdempotentAudit, insertAuditLog } from "@/lib/auditTrail";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };
const patchSchema = z.object({
  clinic_id: z.number().int().positive().default(1),
  mark_unread: z.boolean().optional(),
  assign_doctor_id: z.number().int().positive().optional(),
  archive: z.boolean().optional(),
  state: z.string().max(120).optional(),
  idempotency_key: z.string().max(200).optional(),
});

/**
 * Service-token conversation detail for BFF. Query: clinic_id (default 1).
 */
export async function GET(req: Request, ctx: Ctx) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  const url = new URL(req.url);
  const clinicId = Math.max(1, Number.parseInt(url.searchParams.get("clinic_id") || "1", 10) || 1);
  const convId = Number(ctx.params.id);
  if (!Number.isFinite(convId)) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const conv = await pool.query(
      `SELECT c.id, c.state, c.status, c.routing, c.opened_at, c.closed_at,
              p.id AS patient_id, p.chat_id, p.phone_e164, p.display_name, p.notes, p.is_vip, p.is_blacklisted, p.preferred_language
       FROM conversations c
       JOIN patients p ON p.id = c.patient_id
       WHERE c.id = $1 AND c.clinic_id = $2 AND c.deleted_at IS NULL`,
      [convId, clinicId],
    );
    if (!conv.rows[0]) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const msgs = await pool.query(
      `SELECT id, direction, text, created_at, intent, is_urgent, source
       FROM messages
       WHERE conversation_id = $1 AND clinic_id = $2
       ORDER BY created_at ASC
       LIMIT 500`,
      [convId, clinicId],
    );

    return NextResponse.json({
      ok: true,
      conversation: conv.rows[0],
      messages: msgs.rows,
    });
  } catch (e) {
    opsLogError("internal/conversations/[id]", e, { conversation_id: convId, clinic_id: clinicId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const startedAt = Date.now();
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  const convId = Number(ctx.params.id);
  if (!Number.isFinite(convId) || convId <= 0) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  try {
    const b = parsed.data;
    const pool = getPool();
    const idem = b.idempotency_key?.trim() || null;
    if (idem) {
      const seen = await hasIdempotentAudit(pool, {
        clinicId: b.clinic_id,
        action: "conversation.patch",
        entityId: String(convId),
        idempotencyKey: idem,
      });
      if (seen) return NextResponse.json({ ok: true, duplicate: true });
    }
    const routePatch: Record<string, unknown> = {};
    if (typeof b.mark_unread === "boolean") routePatch.unread = b.mark_unread;
    if (typeof b.assign_doctor_id === "number") routePatch.assigned_doctor_id = b.assign_doctor_id;
    if (typeof b.archive === "boolean") routePatch.archived = b.archive;
    const routeJson = Object.keys(routePatch).length ? JSON.stringify(routePatch) : null;

    const r = await pool.query(
      `UPDATE conversations
       SET state = COALESCE($1::text, state),
           status = CASE WHEN $2::boolean IS TRUE THEN 'closed' ELSE status END,
           closed_at = CASE WHEN $2::boolean IS TRUE THEN COALESCE(closed_at, NOW()) ELSE closed_at END,
           routing = CASE
             WHEN $3::jsonb IS NULL THEN routing
             ELSE COALESCE(routing, '{}'::jsonb) || $3::jsonb
           END,
           updated_at = NOW()
       WHERE id = $4 AND clinic_id = $5 AND deleted_at IS NULL
       RETURNING id, state, status, routing, updated_at`,
      [b.state ?? null, b.archive ?? null, routeJson, convId, b.clinic_id],
    );
    if (!r.rows[0]) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    await insertAuditLog(pool, {
      clinicId: b.clinic_id,
      action: "conversation.patch",
      entityType: "conversation",
      entityId: String(convId),
      payload: {
        ok: true,
        mark_unread: b.mark_unread ?? null,
        assign_doctor_id: b.assign_doctor_id ?? null,
        archive: b.archive ?? null,
        state: b.state ?? null,
        idempotency_key: b.idempotency_key ?? null,
        duration_ms: Date.now() - startedAt,
      },
    });
    return NextResponse.json({ ok: true, conversation: r.rows[0] });
  } catch (e) {
    await insertAuditLog(getPool(), {
      clinicId: parsed.success ? parsed.data.clinic_id : null,
      action: "conversation.patch",
      entityType: "conversation",
      entityId: String(convId),
      payload: { ok: false, duration_ms: Date.now() - startedAt },
    }).catch(() => undefined);
    opsLogError("internal/conversations/[id]:patch", e, { conversation_id: convId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
