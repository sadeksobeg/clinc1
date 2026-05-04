import { NextResponse } from "next/server";
import { callOpsApi, requireUserSession } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireUserSession(req);
  if (session instanceof NextResponse) return session;
  if (session.scope !== "platform") return NextResponse.json(fail("forbidden", "Forbidden"), { status: 403 });

  const upstream = await callOpsApi(req, "/api/internal/platform/me/permissions", { method: "GET" });
  const json = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !json || json.ok !== true) {
    return NextResponse.json(fail(String(json?.error || "upstream_error"), "Failed to load permissions", { status: upstream.status }), {
      status: upstream.status || 502,
    });
  }
  return NextResponse.json(ok({ role: String(json.role || ""), perms: Array.isArray(json.perms) ? json.perms : [] }), { status: 200 });
}

