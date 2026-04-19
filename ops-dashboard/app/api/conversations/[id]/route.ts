import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session?.sub || session.clinicId == null) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const clinicId = Number(session.clinicId);
  const { id } = ctx.params;
  const convId = Number(id);
  if (!Number.isFinite(convId)) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }

  const pool = getPool();
  const conv = await pool.query(
    `SELECT c.id, c.state, c.status, c.opened_at, c.closed_at,
            p.id AS patient_id, p.chat_id, p.display_name, p.notes, p.is_vip, p.is_blacklisted, p.preferred_language
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
}

const patchSchema = z.object({
  status: z.enum(["open", "closed"]),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session?.sub || session.clinicId == null) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "viewer") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const clinicId = Number(session.clinicId);
  const { id } = ctx.params;
  const convId = Number(id);
  if (!Number.isFinite(convId)) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }

  const pool = getPool();
  const r = await pool.query(
    `UPDATE conversations
     SET status = $1,
         closed_at = CASE WHEN $1 = 'closed' THEN COALESCE(closed_at, NOW()) ELSE NULL END,
         updated_at = NOW()
     WHERE id = $2 AND clinic_id = $3 AND deleted_at IS NULL
     RETURNING id, status, closed_at`,
    [parsed.data.status, convId, clinicId],
  );
  if (!r.rows[0]) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, conversation: r.rows[0] });
}
