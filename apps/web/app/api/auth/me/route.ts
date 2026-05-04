import { NextResponse } from "next/server";
import { getUserSessionFromHeaders, readOpsSessionTokenFromHeaders } from "@/lib/webAuth";

function opsBaseUrl(): string {
  const u = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "");
  if (!u) throw new Error("OPS_DASHBOARD_URL is not set");
  return u;
}

export async function GET(req: Request) {
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
    const lockRes = await fetch(`${opsBaseUrl()}/api/auth/billing-lock`, {
      headers: {
        cookie: req.headers.get("cookie") || "",
      },
      cache: "no-store",
    });
    if (lockRes.ok) {
      const lockJson = (await lockRes.json().catch(() => ({}))) as {
        billing_locked?: boolean;
        billing_status?: string;
        clinic_id?: number;
      };
      if (typeof lockJson.billing_locked === "boolean") billing_locked = lockJson.billing_locked;
      if (typeof lockJson.billing_status === "string") billing_status = lockJson.billing_status;
      const clinicId = Number(lockJson.clinic_id || session?.clinic_id || 0);
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
