import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { getRuntimeFlag, setRuntimeFlag } from "@/lib/system/emergencyMode";
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
    flag_key: z.enum(["whatsapp_send_disabled", "ai_autoreply_disabled", "auto_booking_disabled"]),
    enabled: z.boolean(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();

type Ctx = { params: { id: string } };

export async function GET(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  const permDenied = await requirePerm(req, "clinic.services.read");
  if (permDenied) return permDenied;

  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const pool = getPool();
  const [wa, ai, booking] = await Promise.all([
    getRuntimeFlag("whatsapp_send_disabled", { pool }),
    getRuntimeFlag("ai_autoreply_disabled", { pool }),
    getRuntimeFlag("auto_booking_disabled", { pool }),
  ]);
  return NextResponse.json({
    ok: true,
    services: {
      whatsapp_send_disabled: Boolean(wa),
      ai_autoreply_disabled: Boolean(ai),
      auto_booking_disabled: Boolean(booking),
    },
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  const permDenied = await requirePerm(req, "clinic.services.write");
  if (permDenied) return permDenied;

  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const actor = readActor(req);
  const requestId = req.headers.get("x-request-id")?.trim() || null;
  const pool = getPool();

  const keyMap = {
    whatsapp_send_disabled: "whatsapp_send_disabled",
    ai_autoreply_disabled: "ai_autoreply_disabled",
    auto_booking_disabled: "auto_booking_disabled",
  } as const;
  const flagKey = keyMap[parsed.data.flag_key];

  await setRuntimeFlag({
    pool,
    clinicId,
    actorUserId: String(actor || ""),
    flagKey,
    enabled: parsed.data.enabled,
    reason: parsed.data.reason,
    requestId,
  });

  await writeStructuredLog({
    level: "warn",
    eventName: "platform.clinic.service.toggled",
    requestId,
    clinicId,
    userId: actor,
    message: "Clinic service toggled by platform",
    payload: { target_clinic_id: clinicId, flag_key: parsed.data.flag_key, enabled: parsed.data.enabled },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}

