import { NextResponse } from "next/server";

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
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const got = m ? m[1].trim() : "";
  if (got !== expected) return schedulingServiceUnauthorized();
  return null;
}
