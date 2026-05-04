import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { computeSlaDeadline } from "@/lib/support/slaEngine";
import { insertAuditLog } from "@/lib/auditTrail";

const schema = z.object({
  ticket_id: z.number().int().positive(),
  reason: z.string().min(3).max(400).optional(),
});

function readClinicId(req: Request): number {
  return Number(req.headers.get("x-clinic-id") || 0);
}

function readActor(req: Request): number | null {
  const v = Number(req.headers.get("x-user-id") || 0);
  return Number.isFinite(v) && v > 0 ? v : null;
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const pool = getPool();
  const resolvedClinicId = clinicId
    ? clinicId
    : platformScope
      ? Number((await pool.query(`SELECT clinic_id FROM support_tickets WHERE id=$1 LIMIT 1`, [parsed.data.ticket_id])).rows[0]?.clinic_id || 0)
      : 0;
  if (!resolvedClinicId) return NextResponse.json({ ok: false, error: "missing_clinic_scope" }, { status: 400 });
  const out = await pool.query(
    `UPDATE support_tickets
     SET status = 'escalated',
         priority = 'critical',
         support_sla_deadline = $1,
         updated_at = NOW()
     WHERE id = $2 AND clinic_id = $3
     RETURNING id, subject, status, priority, assigned_to, support_sla_deadline, support_first_response_at, support_resolved_at, created_at, updated_at`,
    [computeSlaDeadline("critical"), parsed.data.ticket_id, resolvedClinicId],
  );
  if (!out.rowCount) return NextResponse.json({ ok: false, error: "ticket_not_found" }, { status: 404 });
  if (parsed.data.reason) {
    await pool.query(
      `INSERT INTO support_ticket_messages (ticket_id, clinic_id, sender_user_id, sender_role, body, is_internal_note)
       VALUES ($1, $2, $3, 'clinic_user', $4, TRUE)`,
      [parsed.data.ticket_id, resolvedClinicId, actor, `Escalation note: ${parsed.data.reason}`],
    );
  }
  await insertAuditLog(pool, {
    clinicId: resolvedClinicId,
    actorType: "staff",
    actorId: actor ? String(actor) : null,
    action: "support.ticket.escalate",
    entityType: "support_ticket",
    entityId: String(parsed.data.ticket_id),
    payload: { reason: parsed.data.reason || null },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, ticket: out.rows[0] });
}
