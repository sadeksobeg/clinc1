import { NextResponse, type NextRequest } from "next/server";
import { canAccessStaff, canAccessSupportAgent } from "@/lib/rbac/routeAccess";
import { getUserSessionFromHeaders } from "@/lib/webAuth";

const APP_PREFIXES = [
  "/platform",
  "/dashboard",
  "/inbox",
  "/appointments",
  "/patients",
  "/doctors",
  "/staff",
  "/analytics",
  "/ai-center",
  "/billing",
  "/settings",
  "/support",
  "/support-agent",
  "/ops-center",
  "/admin",
];

function isProtectedPath(pathname: string): boolean {
  return APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

async function emitWebTrace(req: NextRequest, args: { requestId: string; path: string; method: string; clinicId?: number | null; userId?: string | null }) {
  const opsBase = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "");
  const token = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!opsBase || !token) return;
  await fetch(`${opsBase}/api/internal/observability/trace`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "start",
      request_id: args.requestId,
      trace_id: req.headers.get("x-trace-id")?.trim() || requestIdToTraceId(args.requestId),
      source_app: "apps-web",
      path: args.path,
      method: args.method,
      clinic_id: args.clinicId ?? undefined,
      user_id: args.userId ? Number(args.userId) : undefined,
    }),
    cache: "no-store",
  }).catch(() => undefined);
}

function requestIdToTraceId(requestId: string): string {
  return requestId.replaceAll("-", "").slice(0, 128);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestId = req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const traceId = req.headers.get("x-trace-id")?.trim() || requestIdToTraceId(requestId);
  const nextHeaders = new Headers(req.headers);
  nextHeaders.set("x-request-id", requestId);
  nextHeaders.set("x-trace-id", traceId);
  if (!isProtectedPath(pathname)) {
    await emitWebTrace(req, { requestId, path: pathname, method: req.method });
    const res = NextResponse.next({ request: { headers: nextHeaders } });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const session = await getUserSessionFromHeaders(req.headers);
  if (!session) {
    await emitWebTrace(req, { requestId, path: pathname, method: req.method });
    const r = NextResponse.redirect(new URL("/login", req.url));
    r.headers.set("x-request-id", requestId);
    r.cookies.delete("ops_session");
    return r;
  }

  const internalOrigin = process.env.INTERNAL_WEB_ORIGIN?.replace(/\/$/, "").trim();
  const meOrigin = internalOrigin || req.nextUrl.origin;
  const meUrl = new URL("/api/auth/me", meOrigin);
  const meRes = await fetch(meUrl, {
    headers: {
      cookie: req.headers.get("cookie") || "",
    },
    cache: "no-store",
  }).catch(() => null);

  if (!meRes || !meRes.ok) {
    const r = NextResponse.redirect(new URL("/login", req.url));
    r.headers.set("x-request-id", requestId);
    r.cookies.delete("ops_session");
    return r;
  }

  const me = (await meRes.json().catch(() => ({}))) as { billing_locked?: boolean; role?: string; scope?: string };
  await emitWebTrace(req, {
    requestId,
    path: pathname,
    method: req.method,
    clinicId: session.clinic_id,
    userId: session.user_id,
  });
  const roleLower = String(me.role || "").toLowerCase();
  const userScope = me.scope === "platform" ? "platform" : "clinic";
  const isPlatformSuperAdmin = roleLower === "super_admin" && me.scope === "platform";
  const actingClinicId = Number(req.cookies.get("platform_acting_clinic_id")?.value || 0);

  if (pathname === "/support-agent" || pathname.startsWith("/support-agent/")) {
    if (!canAccessSupportAgent(roleLower, userScope)) {
      const r = NextResponse.redirect(new URL("/dashboard", req.url));
      r.headers.set("x-request-id", requestId);
      return r;
    }
  }
  if (pathname === "/staff" || pathname.startsWith("/staff/")) {
    if (!canAccessStaff(roleLower, userScope)) {
      const r = NextResponse.redirect(new URL("/dashboard", req.url));
      r.headers.set("x-request-id", requestId);
      return r;
    }
  }
  const clinicScopedPaths = ["/inbox", "/appointments", "/patients", "/doctors", "/ai-center", "/settings", "/support", "/analytics"];

  // Hard guard: only platform super admin can access /platform routes.
  if (!isPlatformSuperAdmin && (pathname === "/platform" || pathname.startsWith("/platform/"))) {
    const r = NextResponse.redirect(new URL("/dashboard", req.url));
    r.headers.set("x-request-id", requestId);
    return r;
  }

  if (isPlatformSuperAdmin && (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) && !actingClinicId) {
    const r = NextResponse.redirect(new URL("/platform", req.url));
    r.headers.set("x-request-id", requestId);
    return r;
  }
  if (
    isPlatformSuperAdmin &&
    !actingClinicId &&
    clinicScopedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    const r = NextResponse.redirect(new URL("/platform", req.url));
    r.headers.set("x-request-id", requestId);
    return r;
  }
  const allowWhenLocked = pathname === "/billing" || pathname.startsWith("/billing/") || pathname === "/support" || pathname.startsWith("/support/");
  if (!isPlatformSuperAdmin && me.billing_locked === true && !allowWhenLocked) {
    const r = NextResponse.redirect(new URL("/billing", req.url));
    r.headers.set("x-request-id", requestId);
    return r;
  }

  const res = NextResponse.next({ request: { headers: nextHeaders } });
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
