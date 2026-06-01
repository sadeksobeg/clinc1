import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { signOpsToken } from "@/lib/jwt";
import { checkLoginRateLimit } from "@/lib/loginRateLimit";
import { getBillingSnapshot } from "@/lib/billing/localBilling";
import { registerSession } from "@/lib/sessionRevocation";
import { insertAuditLog } from "@/lib/auditTrail";
import { writeStructuredLog } from "@/lib/observability/trace";
import { superAdminIpAllowlistBypassEnabled } from "@/lib/auth/superAdminIpPolicy";
import { ipMatchesAllowlist, readSuperAdminSecurity, requestIp, verifyTotpCode } from "@/lib/auth/superAdminSecurity";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  otp_code: z.string().trim().length(6).optional(),
});

function clientIp(req: Request) {
  return requestIp(req);
}

async function handleLogin(req: Request) {
  const ip = clientIp(req);
  if (!checkLoginRateLimit(ip, 30, 15 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many attempts" }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const { email, password, otp_code } = parsed.data;
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, clinic_id, role, password_hash, is_active, require_mfa, security_flags, token_version, updated_at, created_at
     FROM staff_users
     WHERE lower(email) = lower($1)
       AND deleted_at IS NULL
       AND is_active = TRUE
       AND password_hash IS NOT NULL
     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT 20`,
    [email],
  );
  const rows = r.rows as Array<{
    id: string;
    clinic_id: number;
    role: string;
    password_hash: string | null;
    is_active: boolean;
    require_mfa?: boolean;
    security_flags?: Record<string, unknown>;
    token_version?: number;
  }>;
  if (!rows.length) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  let matched: { id: string; clinic_id: number; role: string; token_version: number; require_mfa: boolean; security_flags?: Record<string, unknown> } | null = null;
  for (const row of rows) {
    if (!row.password_hash) continue;
    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) continue;
    matched = {
      id: row.id,
      clinic_id: Number(row.clinic_id),
      role: row.role,
      require_mfa: row.require_mfa === true,
      security_flags: row.security_flags ?? undefined,
      token_version: Number(row.token_version || 1),
    };
    break;
  }
  if (!matched) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const roleLower = String(matched.role || "").toLowerCase();
  const isSuperAdmin = roleLower === "super_admin";
  const platformEligibleRole = roleLower === "super_admin" || roleLower === "ops_admin" || roleLower === "ops_manager";
  const platformScopeEnabled = matched.security_flags && (matched.security_flags as Record<string, unknown>).platform_scope === true;
  const superAdminWithoutClinic = isSuperAdmin && (!matched.clinic_id || Number(matched.clinic_id) <= 0);
  const wantsPlatformScope = (platformEligibleRole && platformScopeEnabled) || superAdminWithoutClinic;

  if (isSuperAdmin) {
    const sec = await readSuperAdminSecurity(pool, matched.id);
    const ipAllowed = superAdminIpAllowlistBypassEnabled() ? true : ipMatchesAllowlist(ip, sec.allowlist);
    if (!ipAllowed) {
      await insertAuditLog(pool, {
        clinicId: null,
        actorType: "staff_user",
        actorId: matched.id,
        action: "auth.super_admin.ip_blocked",
        entityType: "staff_user",
        entityId: matched.id,
        payload: { ip, allowlist_count: sec.allowlist.length },
      });
      await writeStructuredLog({
        level: "warn",
        eventName: "auth.super_admin.ip_blocked",
        clinicId: null,
        userId: Number(matched.id) || null,
        message: "Super admin login blocked by IP policy",
        payload: { ip },
      });
      return NextResponse.json({ ok: false, error: "ip_not_allowed", seen_ip: ip }, { status: 403 });
    }
    if (superAdminIpAllowlistBypassEnabled()) {
      await writeStructuredLog({
        level: "warn",
        eventName: "auth.super_admin.ip_policy_disabled",
        clinicId: null,
        userId: Number(matched.id) || null,
        message: "Super admin IP allowlist bypassed by env flag (non-production only)",
        payload: { ip },
      });
    }
    const isProduction = process.env.NODE_ENV === "production";
    const devOtpConfigured = (process.env.SUPERADMIN_DEV_OTP || "").trim();
    if (isProduction && devOtpConfigured) {
      await writeStructuredLog({
        level: "error",
        eventName: "auth.super_admin.dev_otp_in_production",
        clinicId: null,
        userId: Number(matched.id) || null,
        message: "SUPERADMIN_DEV_OTP is set in production; ignoring bypass and failing login.",
        payload: { ip },
      });
      return NextResponse.json({ ok: false, error: "misconfiguration" }, { status: 500 });
    }
    const devBypass = !isProduction && devOtpConfigured;
    const bypassOk = Boolean(devBypass && otp_code && otp_code === devOtpConfigured);
    if (!otp_code && !bypassOk) {
      return NextResponse.json({ ok: true, otp_required: true }, { status: 200 });
    }
    if (!bypassOk && (!sec.mfaSecret || !otp_code || !verifyTotpCode(sec.mfaSecret, otp_code))) {
      await insertAuditLog(pool, {
        clinicId: null,
        actorType: "staff_user",
        actorId: matched.id,
        action: "auth.super_admin.mfa_failed",
        entityType: "staff_user",
        entityId: matched.id,
        payload: { ip, otp_present: Boolean(otp_code) },
      });
      await writeStructuredLog({
        level: "warn",
        eventName: "auth.super_admin.mfa_challenge",
        clinicId: null,
        userId: Number(matched.id) || null,
        message: "Super admin MFA challenge failed",
        payload: { ip, otp_present: Boolean(otp_code) },
      });
      return NextResponse.json({ ok: false, error: "mfa_required" }, { status: 401 });
    }
    if (!bypassOk) {
      await pool.query(`UPDATE user_mfa_secrets SET last_verified_at = NOW() WHERE user_id = $1`, [matched.id]);
    }
  }

  let token: string;
  try {
    const billing = isSuperAdmin
      ? { status: "active" as const, is_locked: false, trial_ends_at: null as string | null }
      : await getBillingSnapshot(pool, matched.clinic_id);
    token = await signOpsToken({
      sub: String(matched.id),
      email,
      role: matched.role,
      scope: wantsPlatformScope ? "platform" : "clinic",
      clinicId: wantsPlatformScope ? undefined : matched.clinic_id,
      billingStatus: billing.status,
      billingLocked: billing.is_locked,
      trialEndsAt: billing.trial_ends_at,
      tokenVersion: matched.token_version,
    });
    await registerSession(pool, matched.id, matched.token_version);
    if (isSuperAdmin) {
      await insertAuditLog(pool, {
        clinicId: null,
        actorType: "staff_user",
        actorId: matched.id,
        action: "auth.super_admin.login_success",
        entityType: "staff_user",
        entityId: matched.id,
        payload: { ip, scope: "platform" },
      });
      await writeStructuredLog({
        level: "info",
        eventName: "auth.super_admin.login_success",
        clinicId: null,
        userId: Number(matched.id) || null,
        message: "Super admin login success",
        payload: { ip, scope: "platform" },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Auth misconfiguration";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("ops_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}

export async function POST(req: Request) {
  try {
    return await handleLogin(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/auth/login] unhandled", e);
    return NextResponse.json({ ok: false, error: "internal_error", detail: msg }, { status: 500 });
  }
}
