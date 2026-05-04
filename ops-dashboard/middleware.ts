import { NextResponse, type NextRequest } from "next/server";
import { verifyOpsToken } from "./lib/jwt";

async function resolveFreshBillingLock(req: NextRequest, fallbackLocked: boolean): Promise<{ locked: boolean; unauthorized: boolean }> {
  try {
    const checkUrl = new URL("/api/auth/billing-lock", req.url);
    const r = await fetch(checkUrl, {
      method: "GET",
      headers: {
        cookie: req.headers.get("cookie") || "",
      },
      cache: "no-store",
    });
    if (r.status === 401) return { locked: true, unauthorized: true };
    if (!r.ok) return { locked: fallbackLocked, unauthorized: false };
    const j = (await r.json().catch(() => ({}))) as { billing_locked?: boolean };
    if (typeof j.billing_locked === "boolean") {
      return { locked: j.billing_locked, unauthorized: false };
    }
  } catch {
    // Fall back to token claim on transient failures.
  }
  return { locked: fallbackLocked, unauthorized: false };
}

export async function middleware(req: NextRequest) {
  const requestId = req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-request-id", requestId);
  const path = req.nextUrl.pathname;
  const token = req.cookies.get("ops_session")?.value;
  if (!token) {
    const r = NextResponse.redirect(new URL("/login", req.url));
    r.headers.set("x-request-id", requestId);
    return r;
  }
  const payload = await verifyOpsToken(token);
  if (!payload?.sub) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.headers.set("x-request-id", requestId);
    res.cookies.delete("ops_session");
    return res;
  }
  const fresh = await resolveFreshBillingLock(req, payload.billingLocked === true);
  if (fresh.unauthorized) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.headers.set("x-request-id", requestId);
    res.cookies.delete("ops_session");
    return res;
  }
  const billingLocked = fresh.locked;
  const allowWhenLocked =
    path === "/billing" ||
    path.startsWith("/billing/") ||
    path === "/account" ||
    path.startsWith("/account/") ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/account/");
  if (billingLocked && !allowWhenLocked) {
    const r = NextResponse.redirect(new URL("/billing", req.url));
    r.headers.set("x-request-id", requestId);
    return r;
  }
  if (!billingLocked && (path === "/billing" || path.startsWith("/billing/"))) {
    const r = NextResponse.redirect(new URL("/", req.url));
    r.headers.set("x-request-id", requestId);
    return r;
  }
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: [
    "/inbox",
    "/inbox/:path*",
    "/analytics",
    "/secretary",
    "/secretary/:path*",
    "/doctor",
    "/doctor/:path*",
    "/billing",
    "/billing/:path*",
    "/account",
    "/account/:path*",
    "/welcome",
    "/welcome/:path*",
    "/",
    "/api/inbox",
    "/api/conversations/:path*",
    "/api/secretary/:path*",
    "/api/doctor/:path*",
    "/api/account/:path*",
  ],
};
