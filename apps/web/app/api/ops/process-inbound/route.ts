import { NextResponse } from "next/server";
import { proxyProcessInbound } from "@/lib/ops-server";

/**
 * Server-to-server forward to ops `process-inbound`.
 * Auth: same `Authorization: Bearer SCHEDULING_SERVICE_TOKEN` as ops internal APIs.
 * Do not call from the browser in production (token exposure).
 */
export async function POST(req: Request) {
  const expected = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "SCHEDULING_SERVICE_TOKEN not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const got = m ? m[1].trim() : "";
  if (got !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const res = await proxyProcessInbound(body as Record<string, unknown>);
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
