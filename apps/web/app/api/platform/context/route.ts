import { NextResponse } from "next/server";
import { callOpsApi, requireUserSession } from "@/lib/secure-api";

const COOKIE_KEY = "platform_acting_clinic_id";

function isPlatformSuperAdmin(role?: string, scope?: string): boolean {
  return String(role || "").toLowerCase() === "super_admin" && scope === "platform";
}

export async function GET(req: Request) {
  const session = await requireUserSession(req);
  if (session instanceof NextResponse) return session;
  const cookieHeader = req.headers.get("cookie") || "";
  const cookiePart = cookieHeader
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${COOKIE_KEY}=`));
  const actingClinicId = Number(cookiePart?.split("=")[1] || 0);
  return NextResponse.json({
    ok: true,
    scope: session.scope,
    role: session.role,
    acting_clinic_id: Number.isFinite(actingClinicId) && actingClinicId > 0 ? actingClinicId : null,
  });
}

export async function POST(req: Request) {
  const session = await requireUserSession(req);
  if (session instanceof NextResponse) return session;
  if (!isPlatformSuperAdmin(session.role, session.scope)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { acting_clinic_id?: number | null };
  const clinicId = Number(body.acting_clinic_id || 0);
  const res = NextResponse.json({
    ok: true,
    acting_clinic_id: clinicId > 0 ? clinicId : null,
  });

  if (clinicId > 0) {
    res.cookies.set(COOKIE_KEY, String(clinicId), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    res.cookies.delete(COOKIE_KEY);
  }

  void callOpsApi(req, "/api/internal/platform/context/events", {
    method: "POST",
    bodyObject: {
      event: "platform.context.changed",
      actor_user_id: session.user_id,
      actor_scope: "platform",
      target_clinic_id: clinicId > 0 ? clinicId : null,
      action: clinicId > 0 ? "set" : "clear",
    },
  }).catch(() => undefined);

  return res;
}
