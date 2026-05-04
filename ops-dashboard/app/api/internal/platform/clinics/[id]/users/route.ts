import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
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

const createSchema = z
  .object({
    email: z.string().email(),
    display_name: z.string().trim().min(2).max(120).optional(),
    role: z
      .enum(["admin", "operator", "viewer", "staff", "secretary", "doctor", "owner", "ops_admin", "ops_manager"])
      .default("viewer"),
    password: z.string().min(8).max(200),
    require_mfa: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

type Ctx = { params: { id: string } };

export async function GET(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const permDenied = await requirePerm(req, "clinic.users.read");
  if (permDenied) return permDenied;

  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const pool = getPool();
  const r = await pool.query(
    `SELECT id, clinic_id, email, display_name, role, is_active, require_mfa, created_at, updated_at
     FROM staff_users
     WHERE clinic_id=$1 AND deleted_at IS NULL
     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT 200`,
    [clinicId],
  );

  return NextResponse.json({
    ok: true,
    users: (r.rows ?? []).map((u: any) => ({
      id: Number(u.id),
      clinic_id: Number(u.clinic_id),
      email: u.email ?? null,
      display_name: u.display_name ?? null,
      role: String(u.role || ""),
      is_active: Boolean(u.is_active),
      require_mfa: Boolean(u.require_mfa),
      created_at: u.created_at ? new Date(u.created_at).toISOString() : null,
      updated_at: u.updated_at ? new Date(u.updated_at).toISOString() : null,
    })),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const permDenied = await requirePerm(req, "clinic.users.write");
  if (permDenied) return permDenied;

  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const actor = readActor(req);
  const requestId = req.headers.get("x-request-id")?.trim() || null;

  const email = parsed.data.email.trim().toLowerCase();
  const displayName = parsed.data.display_name?.trim() || null;
  const role = parsed.data.role;
  const hash = await bcrypt.hash(parsed.data.password, 10);
  const requireMfa = parsed.data.require_mfa === true;
  const isActive = parsed.data.is_active !== false;

  const pool = getPool();
  const r = await pool.query(
    `INSERT INTO staff_users (clinic_id, email, display_name, role, password_hash, is_active, require_mfa, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
     ON CONFLICT (clinic_id, email)
     DO UPDATE SET
       display_name = COALESCE(EXCLUDED.display_name, staff_users.display_name),
       role = EXCLUDED.role,
       password_hash = EXCLUDED.password_hash,
       is_active = EXCLUDED.is_active,
       require_mfa = EXCLUDED.require_mfa,
       deleted_at = NULL,
       updated_at = NOW()
     RETURNING id`,
    [clinicId, email, displayName, role, hash, isActive, requireMfa],
  );

  await writeStructuredLog({
    level: "info",
    eventName: "platform.clinic.user.upserted",
    requestId,
    clinicId,
    userId: actor,
    message: "Clinic user created/updated by platform",
    payload: { target_clinic_id: clinicId, email, role },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, user_id: Number(r.rows[0]?.id || 0) }, { status: 200 });
}

