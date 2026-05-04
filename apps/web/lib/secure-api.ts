import { NextResponse } from "next/server";
import type { WebUserSession } from "@/lib/webAuth";

function cookieValue(cookieHeader: string, key: string): string | null {
  const items = cookieHeader.split(";").map((x) => x.trim());
  for (const item of items) {
    if (!item.startsWith(`${key}=`)) continue;
    const value = item.slice(key.length + 1);
    if (!value) return null;
    return decodeURIComponent(value);
  }
  return null;
}

function readActingClinicIdFromCookie(req: Request): number {
  const raw = cookieValue(req.headers.get("cookie") || "", "platform_acting_clinic_id");
  const n = Number(raw || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function resolveTraceId(req: Request): string {
  const inbound = req.headers.get("x-trace-id")?.trim();
  if (inbound && inbound.length >= 16) return inbound.slice(0, 128);
  return crypto.randomUUID().replaceAll("-", "");
}

export async function requireUserSession(req: Request): Promise<WebUserSession | NextResponse> {
  const meUrl = new URL("/api/auth/me", req.url);
  const r = await fetch(meUrl, {
    method: "GET",
    headers: { cookie: req.headers.get("cookie") || "" },
    cache: "no-store",
  }).catch(() => null);
  if (!r || !r.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const j = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    user_id?: string | number;
    clinic_id?: number;
    role?: string;
    billing_status?: string;
    billing_locked?: boolean;
    scope?: "clinic" | "platform";
  };
  const isPlatform = j.scope === "platform";
  if (!j.ok || !j.user_id || (!j.clinic_id && !isPlatform)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return {
    user_id: String(j.user_id),
    clinic_id: isPlatform ? 0 : Number(j.clinic_id),
    role: j.role,
    scope: j.scope || "clinic",
    billing_status: j.billing_status,
    billing_locked: Boolean(j.billing_locked),
    raw_token: "",
  };
}

export async function requireUserWithClinic(req: Request): Promise<WebUserSession | NextResponse> {
  const session = await requireUserSession(req);
  if (session instanceof NextResponse) return session;
  if (session.scope === "platform") {
    return session;
  }
  if (!session.clinic_id) {
    return NextResponse.json({ ok: false, error: "clinic_scope_required" }, { status: 403 });
  }
  return session;
}

function opsBaseUrl(): string {
  const u = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "");
  if (!u) throw new Error("OPS_DASHBOARD_URL is not set");
  return u;
}

function serviceToken(): string {
  const token = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!token) throw new Error("SCHEDULING_SERVICE_TOKEN is not set");
  return token;
}

export async function callOpsApi(
  req: Request,
  path: string,
  init: RequestInit & { bodyObject?: unknown } = {},
): Promise<Response> {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) {
    return new Response(await user.text(), { status: user.status, headers: user.headers });
  }
  const body =
    init.bodyObject !== undefined
      ? JSON.stringify(init.bodyObject)
      : typeof init.body === "string" || init.body instanceof Uint8Array
        ? init.body
        : init.body;

  const headers = new Headers(init.headers || {});
  headers.set("x-request-id", req.headers.get("x-request-id") || crypto.randomUUID());
  headers.set("x-trace-id", resolveTraceId(req));
  headers.set("Authorization", `Bearer ${serviceToken()}`);
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");
  const targetClinicFromBody =
    init.bodyObject && typeof init.bodyObject === "object" && "clinic_id" in (init.bodyObject as Record<string, unknown>)
      ? Number((init.bodyObject as Record<string, unknown>).clinic_id || 0)
      : 0;
  const isPlatform = user.scope === "platform";
  const actingClinicId = readActingClinicIdFromCookie(req);
  const method = (init.method || "GET").toUpperCase();
  const isPlatformGlobalWrite =
    isPlatform &&
    (path === "/api/internal/platform/clinics/create" || path.startsWith("/api/internal/platform/clinics/create?"));
  if (
    isPlatform &&
    !isPlatformGlobalWrite &&
    method !== "GET" &&
    method !== "HEAD" &&
    targetClinicFromBody <= 0 &&
    actingClinicId <= 0
  ) {
    return NextResponse.json(
      { ok: false, error: "target_clinic_required_for_platform_write" },
      { status: 400 },
    );
  }
  if (!isPlatform || targetClinicFromBody > 0 || actingClinicId > 0) {
    headers.set("x-clinic-id", String(targetClinicFromBody > 0 ? targetClinicFromBody : isPlatform ? actingClinicId : user.clinic_id));
  }
  headers.set("x-user-id", String(user.user_id));
  if (isPlatform) headers.set("x-platform-scope", "true");

  try {
    return await fetch(`${opsBaseUrl()}${path}`, {
      ...init,
      headers,
      body,
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream_unavailable";
    return new Response(JSON.stringify({ ok: false, error: "ops_dashboard_unavailable", message: msg }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}
