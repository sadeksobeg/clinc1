import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { writeStructuredLog } from "@/lib/observability/trace";

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

const schema = z
  .object({
    title: z.string().trim().min(2).max(160),
    body: z.string().trim().min(2).max(2000),
    type: z.string().trim().min(2).max(64).default("platform_announcement"),
  })
  .strict();

type Ctx = { params: { id: string } };

export async function GET(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  const permDenied = await requirePerm(req, "clinic.notifications.read");
  if (permDenied) return permDenied;

  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const pool = getPool();
  const r = await pool.query(
    `SELECT id, type, title, body, read, created_at
     FROM notifications
     WHERE clinic_id=$1
     ORDER BY created_at DESC
     LIMIT 50`,
    [clinicId],
  );
  return NextResponse.json({
    ok: true,
    notifications: (r.rows ?? []).map((n: any) => ({
      id: Number(n.id),
      type: String(n.type || ""),
      title: String(n.title || ""),
      body: String(n.body || ""),
      read: Boolean(n.read),
      created_at: n.created_at ? new Date(n.created_at).toISOString() : null,
    })),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  const permDenied = await requirePerm(req, "clinic.notifications.write");
  if (permDenied) return permDenied;

  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const actor = readActor(req);
  const requestId = req.headers.get("x-request-id")?.trim() || null;
  const pool = getPool();
  const r = await pool.query(
    `INSERT INTO notifications (clinic_id, type, title, body, read)
     VALUES ($1, $2, $3, $4, FALSE)
     RETURNING id`,
    [clinicId, parsed.data.type, parsed.data.title, parsed.data.body],
  );

  await writeStructuredLog({
    level: "info",
    eventName: "platform.clinic.notification.sent",
    requestId,
    clinicId,
    userId: actor,
    message: "Clinic notification sent by platform",
    payload: { notification_id: Number(r.rows[0]?.id || 0), type: parsed.data.type, title: parsed.data.title },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, notification_id: Number(r.rows[0]?.id || 0) }, { status: 200 });
}

