import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { computeFirstResponseDueAt, computePriorityScore, computeSlaBreach, computeSlaDeadline } from "@/lib/support/slaEngine";
import { insertAuditLog } from "@/lib/auditTrail";
import { writeStructuredLog } from "@/lib/observability/trace";

const createSchema = z.object({
  subject: z.string().min(3).max(300),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  message: z.string().min(1).max(4000),
});
const patchSchema = z.object({
  ticket_id: z.number().int().positive(),
  status: z.enum(["open", "assigned", "escalated", "resolved"]),
  clinic_id: z.number().int().nonnegative().optional(),
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
  if (!clinicId && !platformScope) return NextResponse.json({ ok: false, error: "missing_clinic_scope" }, { status: 400 });

  const pool = getPool();
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "100")));
  const clinicFilter = platformScope ? Math.max(0, Number(url.searchParams.get("clinic_id") || "0") || 0) : 0;
  const requestId = req.headers.get("x-request-id")?.trim() || null;
  const actorUserId = Number(req.headers.get("x-user-id") || 0) || null;
  if (platformScope) {
    await writeStructuredLog({
      level: "info",
      eventName: "platform.support.queue.read",
      requestId,
      clinicId: null,
      userId: actorUserId,
      message: "Platform support queue read",
      payload: { limit, clinic_id: clinicFilter || null },
    }).catch(() => undefined);
  }
  const r = platformScope
    ? await pool.query(
        `SELECT t.id, t.clinic_id, c.name AS clinic_name, t.subject, t.status, t.priority, t.assigned_to,
                t.support_sla_deadline, t.support_first_response_due_at, t.support_first_response_at, t.support_resolved_at,
                t.support_breach_flag, t.support_priority_score, t.created_at, t.updated_at
         FROM support_tickets t
         JOIN clinics c ON c.id = t.clinic_id
         WHERE ($1::int = 0 OR t.clinic_id = $1)
         ORDER BY t.created_at DESC
         LIMIT ${limit}`,
        [clinicFilter],
      )
    : await pool.query(
        `SELECT id, subject, status, priority, assigned_to, support_sla_deadline, support_first_response_due_at,
                support_first_response_at, support_resolved_at, support_breach_flag, support_priority_score, created_at, updated_at
         FROM support_tickets
         WHERE clinic_id = $1
         ORDER BY created_at DESC
         LIMIT ${limit}`,
        [clinicId],
      );
  const tickets = (r.rows as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    sla: computeSlaBreach({
      status: String(row.status) as "open" | "assigned" | "escalated" | "resolved",
      support_sla_deadline: (row.support_sla_deadline as string | null) ?? null,
      support_first_response_at: (row.support_first_response_at as string | null) ?? null,
      support_first_response_due_at: (row.support_first_response_due_at as string | null) ?? null,
    }),
  }));
  return NextResponse.json({ ok: true, tickets });
}

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const clinicId = readClinicId(req);
  if (!clinicId) return NextResponse.json({ ok: false, error: "missing_clinic_scope" }, { status: 400 });
  const actor = readActor(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const pool = getPool();
  const deadline = computeSlaDeadline(parsed.data.priority);
  const firstResponseDue = computeFirstResponseDueAt(parsed.data.priority);
  const priorityScore = computePriorityScore(parsed.data.priority, "open");
  const created = await pool.query(
    `INSERT INTO support_tickets
      (clinic_id, created_by, subject, status, priority, support_sla_deadline, support_first_response_due_at, support_priority_score)
     VALUES ($1, $2, $3, 'open', $4, $5, $6, $7)
     RETURNING id, subject, status, priority, support_sla_deadline, support_first_response_due_at, support_priority_score, created_at, updated_at`,
    [clinicId, actor, parsed.data.subject, parsed.data.priority, deadline, firstResponseDue, priorityScore],
  );
  const ticket = created.rows[0] as { id: number };
  await pool.query(
    `INSERT INTO support_ticket_messages (ticket_id, clinic_id, sender_user_id, sender_role, body, is_internal_note)
     VALUES ($1, $2, $3, 'clinic_user', $4, FALSE)`,
    [ticket.id, clinicId, actor, parsed.data.message],
  );
  await insertAuditLog(pool, {
    clinicId,
    actorType: "staff",
    actorId: actor ? String(actor) : null,
    action: "support.ticket.create",
    entityType: "support_ticket",
    entityId: String(ticket.id),
    payload: { subject: parsed.data.subject, priority: parsed.data.priority },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, ticket: created.rows[0] }, { status: 201 });
}

export async function PATCH(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const clinicId = readClinicId(req);
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!clinicId && !platformScope) return NextResponse.json({ ok: false, error: "missing_clinic_scope" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const pool = getPool();
  const resolvedClinicId =
    clinicId ||
    Math.max(0, Number(parsed.data.clinic_id || 0)) ||
    (platformScope
      ? Number((await pool.query(`SELECT clinic_id FROM support_tickets WHERE id=$1 LIMIT 1`, [parsed.data.ticket_id])).rows[0]?.clinic_id || 0)
      : 0);
  if (!resolvedClinicId) return NextResponse.json({ ok: false, error: "missing_clinic_scope" }, { status: 400 });
  const status = parsed.data.status;
  const out = await pool.query(
    `UPDATE support_tickets
     SET status = $1,
         support_priority_score = CASE
           WHEN priority = 'critical' THEN 90
           WHEN priority = 'high' THEN 70
           WHEN priority = 'normal' THEN 50
           ELSE 30
         END + CASE WHEN $1 = 'escalated' THEN 10 WHEN $1 = 'assigned' THEN 5 ELSE 0 END,
         support_resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE support_resolved_at END,
         updated_at = NOW()
     WHERE id = $2 AND clinic_id = $3
     RETURNING id, subject, status, priority, assigned_to, support_sla_deadline, support_first_response_due_at, support_first_response_at, support_resolved_at, support_breach_flag, support_priority_score, created_at, updated_at`,
    [status, parsed.data.ticket_id, resolvedClinicId],
  );
  if (!out.rowCount) return NextResponse.json({ ok: false, error: "ticket_not_found" }, { status: 404 });
  await insertAuditLog(pool, {
    clinicId: resolvedClinicId,
    action: "support.ticket.status",
    entityType: "support_ticket",
    entityId: String(parsed.data.ticket_id),
    payload: { status },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, ticket: out.rows[0] });
}
