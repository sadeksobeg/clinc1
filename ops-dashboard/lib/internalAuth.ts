import { NextResponse } from "next/server";

function weakToken(token: string): boolean {
  const t = token.trim().toLowerCase();
  if (!t) return true;
  if (t.length < 24) return true;
  return ["changeme", "admin12345", "token", "dev-token", "default", "secret"].includes(t);
}

export function schedulingServiceUnauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export function schedulingServiceMisconfigured(): NextResponse {
  return NextResponse.json({ ok: false, error: "SCHEDULING_SERVICE_TOKEN not configured" }, { status: 503 });
}

/** Returns null if OK, otherwise a NextResponse error. */
export function assertSchedulingServiceToken(req: Request): NextResponse | null {
  const expected = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!expected) return schedulingServiceMisconfigured();
  if (process.env.NODE_ENV === "production" && weakToken(expected)) {
    return NextResponse.json(
      { ok: false, error: "SCHEDULING_SERVICE_TOKEN is weak for production (must be random and >=24 chars)" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const got = m ? m[1].trim() : "";
  if (got !== expected) return schedulingServiceUnauthorized();
  return null;
}

function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : "";
}

/** Deep health: accept HEALTH_DEEP_TOKEN and/or SCHEDULING_SERVICE_TOKEN (either matches). */
export function assertDeepHealthToken(req: Request): NextResponse | null {
  const deep = process.env.HEALTH_DEEP_TOKEN?.trim();
  const sched = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!deep && !sched) {
    return NextResponse.json(
      { ok: false, error: "Deep health auth not configured (set HEALTH_DEEP_TOKEN and/or SCHEDULING_SERVICE_TOKEN)" },
      { status: 503 },
    );
  }
  const got = bearerToken(req);
  if ((deep && got === deep) || (sched && got === sched)) return null;
  return schedulingServiceUnauthorized();
}
