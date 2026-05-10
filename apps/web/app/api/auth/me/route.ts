import { NextResponse } from "next/server";
import {
  decodeJwtPayloadUnverified,
  getUserSessionFromHeaders,
  readOpsSessionTokenFromHeaders,
} from "@/lib/webAuth";

function opsBaseUrl(): string | null {
  const u = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "") || "";
  return u || null;
}

export async function GET(req: Request) {
  const base = opsBaseUrl();
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "auth_misconfigured", detail: "OPS_DASHBOARD_URL is not set on clinic-web" },
      { status: 503 },
    );
  }

  const token = readOpsSessionTokenFromHeaders(req.headers);
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const session = await getUserSessionFromHeaders(req.headers);
  const sessionUserId = session?.user_id ?? "";
  const sessionClinicId = session?.clinic_id ?? 0;
  const sessionRole = session?.role || "viewer";
  const sessionScope = session?.scope || "clinic";
  const sessionBillingLocked = Boolean(session?.billing_locked);
  const sessionBillingStatus = session?.billing_status || "unknown";

  if (sessionScope === "platform") {
    return NextResponse.json({
      ok: true,
      user_id: sessionUserId,
      clinic_id: 0,
      role: sessionRole,
      scope: "platform",
      billing_status: "active",
      billing_locked: false,
    });
  }

  let billing_locked = sessionBillingLocked;
  let billing_status = sessionBillingStatus;
  try {
    const lockRes = await fetch(`${base}/api/auth/billing-lock`, {
      headers: {
        cookie: req.headers.get("cookie") || "",
      },
      cache: "no-store",
    });
    if (lockRes.ok) {
      const lockJson = (await lockRes.json().catch(() => ({}))) as {
        billing_locked?: boolean;
        billing_status?: string;
        clinic_id?: number | null;
        scope?: string;
      };
      if (typeof lockJson.billing_locked === "boolean") billing_locked = lockJson.billing_locked;
      if (typeof lockJson.billing_status === "string") billing_status = lockJson.billing_status;
      // ops-dashboard billing-lock returns clinic_id: null for platform super_admin — do not treat as unauthorized
      if (lockJson.scope === "platform") {
        const claims = decodeJwtPayloadUnverified(token);
        const uid = sessionUserId || (claims?.sub ? String(claims.sub) : "");
        const role = sessionRole || (typeof claims?.role === "string" ? claims.role : "super_admin");
        return NextResponse.json({
          ok: true,
          user_id: uid,
          clinic_id: 0,
          role,
          scope: "platform",
          billing_status: "active",
          billing_locked: false,
        });
      }
      const clinicId = Number(lockJson.clinic_id ?? session?.clinic_id ?? 0);
      if (!clinicId) {
        return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
      return NextResponse.json({
        ok: true,
        user_id: sessionUserId,
        clinic_id: clinicId,
        role: sessionRole,
        scope: "clinic",
        billing_status,
        billing_locked,
      });
    }
    if (lockRes.status === 401) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  } catch {
    // keep token hints as fallback
  }

  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    user_id: sessionUserId,
    clinic_id: sessionClinicId,
    role: sessionRole,
    scope: sessionScope,
    billing_status,
    billing_locked,
  });
}
