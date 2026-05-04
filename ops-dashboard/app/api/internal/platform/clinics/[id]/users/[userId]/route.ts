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

const patchSchema = z
  .object({
    display_name: z.string().trim().min(2).max(120).optional(),
    role: z.enum(["admin", "operator", "viewer", "staff", "secretary", "doctor", "owner", "ops_admin", "ops_manager"]).optional(),
    is_active: z.boolean().optional(),
    require_mfa: z.boolean().optional(),
    reset_password: z
      .object({
        new_password: z.string().min(8).max(200),
      })
      .optional(),
  })
  .strict();

type Ctx = { params: { id: string; userId: string } };

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const permDenied = await requirePerm(req, "clinic.users.write");
  if (permDenied) return permDenied;

  const clinicId = Number(ctx.params.id);
  const userId = Number(ctx.params.userId);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  if (!Number.isFinite(userId) || userId <= 0) return NextResponse.json({ ok: false, error: "bad_user_id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const actor = readActor(req);
  const requestId = req.headers.get("x-request-id")?.trim() || null;
  const pool = getPool();

  if (parsed.data.reset_password?.new_password) {
    const hash = await bcrypt.hash(parsed.data.reset_password.new_password, 10);
    await pool.query(
      `UPDATE staff_users
       SET password_hash=$1, token_version=token_version+1, updated_at=NOW()
       WHERE id=$2 AND clinic_id=$3 AND deleted_at IS NULL`,
      [hash, userId, clinicId],
    );
    await writeStructuredLog({
      level: "warn",
      eventName: "platform.clinic.user.password_reset",
      requestId,
      clinicId,
      userId: actor,
      message: "Clinic user password reset by platform",
      payload: { target_user_id: userId, target_clinic_id: clinicId },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  const set: string[] = [];
  const values: any[] = [];
  let idx = 1;
  if (typeof parsed.data.display_name === "string") {
    set.push(`display_name=$${idx++}`);
    values.push(parsed.data.display_name.trim());
  }
  if (typeof parsed.data.role === "string") {
    set.push(`role=$${idx++}`);
    values.push(parsed.data.role);
  }
  if (typeof parsed.data.is_active === "boolean") {
    set.push(`is_active=$${idx++}`);
    values.push(parsed.data.is_active);
  }
  if (typeof parsed.data.require_mfa === "boolean") {
    set.push(`require_mfa=$${idx++}`);
    values.push(parsed.data.require_mfa);
  }
  if (set.length === 0) return NextResponse.json({ ok: true, noop: true });

  values.push(userId, clinicId);
  await pool.query(
    `UPDATE staff_users
     SET ${set.join(", ")}, updated_at=NOW()
     WHERE id=$${idx++} AND clinic_id=$${idx++} AND deleted_at IS NULL`,
    values,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const permDenied = await requirePerm(req, "clinic.users.write");
  if (permDenied) return permDenied;

  const clinicId = Number(ctx.params.id);
  const userId = Number(ctx.params.userId);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  if (!Number.isFinite(userId) || userId <= 0) return NextResponse.json({ ok: false, error: "bad_user_id" }, { status: 400 });

  const actor = readActor(req);
  const requestId = req.headers.get("x-request-id")?.trim() || null;
  const pool = getPool();
  await pool.query(`UPDATE staff_users SET deleted_at=NOW(), is_active=FALSE, updated_at=NOW() WHERE id=$1 AND clinic_id=$2`, [userId, clinicId]);
  await writeStructuredLog({
    level: "warn",
    eventName: "platform.clinic.user.deleted",
    requestId,
    clinicId,
    userId: actor,
    message: "Clinic user deleted by platform",
    payload: { target_user_id: userId, target_clinic_id: clinicId },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

