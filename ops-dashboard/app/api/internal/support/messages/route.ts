import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";

const postSchema = z.object({
  ticket_id: z.number().int().positive(),
  body: z.string().min(1).max(4000),
  is_internal_note: z.boolean().optional(),
});

function readClinicId(req: Request): number {
  return Number(req.headers.get("x-clinic-id") || 0);
}

function readActor(req: Request): number | null {
  const v = Number(req.headers.get("x-user-id") || 0);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const clinicId = readClinicId(req);
  const platformScope = req.headers.get("x-platform-scope") === "true";
  const url = new URL(req.url);
  const ticketId = Number(url.searchParams.get("ticket_id") || 0);
  if (!ticketId) return NextResponse.json({ ok: false, error: "ticket_id_required" }, { status: 400 });

  const pool = getPool();
  const resolvedClinicId = clinicId
    ? clinicId
    : platformScope
      ? Number((await pool.query(`SELECT clinic_id FROM support_tickets WHERE id=$1 LIMIT 1`, [ticketId])).rows[0]?.clinic_id || 0)
      : 0;
  if (!resolvedClinicId) return NextResponse.json({ ok: false, error: "missing_scope" }, { status: 400 });
  const r = await pool.query(
    `SELECT id, ticket_id, sender_user_id, sender_role, body, is_internal_note, created_at
     FROM support_ticket_messages
     WHERE clinic_id = $1 AND ticket_id = $2
     ORDER BY created_at ASC`,
    [resolvedClinicId, ticketId],
  );
  return NextResponse.json({ ok: true, messages: r.rows });
}

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const clinicId = readClinicId(req);
  const platformScope = req.headers.get("x-platform-scope") === "true";
  const actor = readActor(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const pool = getPool();
  const resolvedClinicId = clinicId
    ? clinicId
    : platformScope
      ? Number((await pool.query(`SELECT clinic_id FROM support_tickets WHERE id=$1 LIMIT 1`, [parsed.data.ticket_id])).rows[0]?.clinic_id || 0)
      : 0;
  if (!resolvedClinicId) return NextResponse.json({ ok: false, error: "missing_clinic_scope" }, { status: 400 });
  const exists = await pool.query(`SELECT id FROM support_tickets WHERE id = $1 AND clinic_id = $2 LIMIT 1`, [parsed.data.ticket_id, resolvedClinicId]);
  if (!exists.rowCount) return NextResponse.json({ ok: false, error: "ticket_not_found" }, { status: 404 });

  const out = await pool.query(
    `INSERT INTO support_ticket_messages (ticket_id, clinic_id, sender_user_id, sender_role, body, is_internal_note)
     VALUES ($1, $2, $3, 'clinic_user', $4, $5)
     RETURNING id, ticket_id, sender_user_id, sender_role, body, is_internal_note, created_at`,
    [parsed.data.ticket_id, resolvedClinicId, actor, parsed.data.body, parsed.data.is_internal_note === true],
  );
  await pool.query(
    `UPDATE support_tickets
     SET updated_at = NOW(),
         support_first_response_at = COALESCE(support_first_response_at, NOW())
     WHERE id = $1 AND clinic_id = $2`,
    [parsed.data.ticket_id, resolvedClinicId],
  );
  await insertAuditLog(pool, {
    clinicId: resolvedClinicId,
    actorType: "staff",
    actorId: actor ? String(actor) : null,
    action: "support.ticket.message",
    entityType: "support_ticket",
    entityId: String(parsed.data.ticket_id),
    payload: { internal_note: parsed.data.is_internal_note === true },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, message: out.rows[0] }, { status: 201 });
}
