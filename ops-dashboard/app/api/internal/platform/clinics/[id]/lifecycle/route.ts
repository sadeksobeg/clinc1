import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";
import { writeStructuredLog } from "@/lib/observability/trace";

const schema = z
  .object({
    action: z.enum(["suspend", "activate", "set_trial_days", "set_plan", "set_owner"]),
    reason: z.string().min(3).max(500).optional(),
    trial_days: z.number().int().min(1).max(60).optional(),
    plan: z.enum(["starter_120", "custom"]).optional(),
    plan_base_price_usd: z.number().min(0).max(100000).optional(),
    plan_included_doctors: z.number().int().min(0).max(1000).optional(),
    plan_extra_doctor_price_usd: z.number().min(0).max(100000).optional(),
    owner_name: z.string().min(2).max(120).optional(),
    owner_whatsapp: z.string().min(6).max(64).optional(),
  })
  .strict();

type Ctx = { params: { id: string } };

function actorUserId(req: Request): number | null {
  const v = Number(req.headers.get("x-user-id") || 0);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function actorHasLifecycleWrite(role: string, flags: Record<string, unknown> | null | undefined): boolean {
  const r = String(role || "").toLowerCase();
  if (r === "super_admin") return true;
  const perms = (flags && Array.isArray((flags as any).platform_perms) ? (flags as any).platform_perms : []) as unknown[];
  return perms.map((x) => String(x)).includes("clinic.lifecycle.write");
}

export async function POST(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const pool = getPool();
  const actor = actorUserId(req);
  const requestId = req.headers.get("x-request-id")?.trim() || null;
  const data = parsed.data;

  if (actor) {
    const u = await pool.query(`SELECT role, security_flags FROM staff_users WHERE id=$1 AND deleted_at IS NULL LIMIT 1`, [actor]);
    const row = u.rows[0] as { role: string; security_flags?: Record<string, unknown> } | undefined;
    if (!row) return NextResponse.json({ ok: false, error: "actor_not_found" }, { status: 403 });
    if (!actorHasLifecycleWrite(row.role, row.security_flags)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ ok: false, error: "missing_actor" }, { status: 400 });
  }

  const clinicR = await pool.query(`SELECT id, metadata FROM clinics WHERE id=$1 AND deleted_at IS NULL`, [clinicId]);
  if (!clinicR.rows[0]) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (data.action === "suspend") {
    const reason = String(data.reason || "platform_suspend").slice(0, 500);
    await pool.query(
      `UPDATE clinic_local_subscriptions
       SET status='suspended', suspended_at=NOW(), suspension_reason=$2, updated_at=NOW()
       WHERE clinic_id=$1`,
      [clinicId, reason],
    );
    await insertAuditLog(pool, {
      clinicId,
      actorType: "staff",
      actorId: actor ? String(actor) : null,
      action: "platform.clinic.suspended",
      entityType: "clinic",
      entityId: String(clinicId),
      payload: { reason },
    }).catch(() => undefined);
    await writeStructuredLog({
      level: "warn",
      eventName: "platform.clinic.suspended",
      requestId,
      clinicId,
      userId: actor,
      message: "Clinic suspended by platform",
      payload: { reason, actor_scope: "platform", target_clinic_id: clinicId },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  if (data.action === "activate") {
    await pool.query(
      `UPDATE clinic_local_subscriptions
       SET status='active', active_started_at=COALESCE(active_started_at, NOW()), suspended_at=NULL, suspension_reason=NULL,
           next_renewal_at=COALESCE(next_renewal_at, NOW() + interval '30 days'), updated_at=NOW()
       WHERE clinic_id=$1`,
      [clinicId],
    );
    await insertAuditLog(pool, {
      clinicId,
      actorType: "staff",
      actorId: actor ? String(actor) : null,
      action: "platform.clinic.activated",
      entityType: "clinic",
      entityId: String(clinicId),
      payload: {},
    }).catch(() => undefined);
    await writeStructuredLog({
      level: "info",
      eventName: "platform.clinic.activated",
      requestId,
      clinicId,
      userId: actor,
      message: "Clinic activated by platform",
      payload: { actor_scope: "platform", target_clinic_id: clinicId },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  if (data.action === "set_trial_days") {
    const days = Number(data.trial_days || 0);
    if (!days) return NextResponse.json({ ok: false, error: "trial_days_required" }, { status: 400 });
    await pool.query(
      `UPDATE clinic_local_subscriptions
       SET status='trial', trial_started_at=NOW(), trial_ends_at=NOW() + ($2::text || ' days')::interval, updated_at=NOW()
       WHERE clinic_id=$1`,
      [clinicId, String(days)],
    );
    await insertAuditLog(pool, {
      clinicId,
      actorType: "staff",
      actorId: actor ? String(actor) : null,
      action: "platform.clinic.trial.set",
      entityType: "clinic",
      entityId: String(clinicId),
      payload: { trial_days: days },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  if (data.action === "set_plan") {
    const plan = data.plan || "starter_120";
    const base = plan === "starter_120" ? 120 : Number(data.plan_base_price_usd || 0);
    const included = plan === "starter_120" ? 1 : Number(data.plan_included_doctors || 0);
    const extra = plan === "starter_120" ? 30 : Number(data.plan_extra_doctor_price_usd || 0);
    await pool.query(
      `UPDATE clinic_local_subscriptions
       SET base_price_usd=$2, included_doctors=$3, extra_doctor_price_usd=$4,
           metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('billing_plan',$5),
           updated_at=NOW()
       WHERE clinic_id=$1`,
      [clinicId, base, included, extra, plan],
    );
    await insertAuditLog(pool, {
      clinicId,
      actorType: "staff",
      actorId: actor ? String(actor) : null,
      action: "platform.clinic.plan.set",
      entityType: "clinic",
      entityId: String(clinicId),
      payload: { plan, base_price_usd: base, included_doctors: included, extra_doctor_price_usd: extra },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  if (data.action === "set_owner") {
    const owner_name = data.owner_name?.trim();
    const owner_whatsapp = data.owner_whatsapp?.trim();
    if (!owner_name && !owner_whatsapp) return NextResponse.json({ ok: false, error: "owner_fields_required" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (owner_name) patch.owner_name = owner_name;
    if (owner_whatsapp) patch.owner_whatsapp = owner_whatsapp;
    await pool.query(
      `UPDATE clinics
       SET metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb,
           updated_at=NOW()
       WHERE id=$1 AND deleted_at IS NULL`,
      [clinicId, JSON.stringify(patch)],
    );
    await insertAuditLog(pool, {
      clinicId,
      actorType: "staff",
      actorId: actor ? String(actor) : null,
      action: "platform.clinic.owner.set",
      entityType: "clinic",
      entityId: String(clinicId),
      payload: patch,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
}

