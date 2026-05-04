import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const allowed = await requirePlatformPerm(req, "system.read");
  if (allowed instanceof NextResponse) return allowed;

  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const upstream = await callOpsApi(req, `/api/internal/platform/system/state${qs ? `?${qs}` : ""}`, { method: "GET" });
  const json = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !json || json.ok !== true) {
    return NextResponse.json(fail(String(json?.error || "upstream_error"), "Upstream system state failed", { status: upstream.status }), {
      status: upstream.ok ? 400 : upstream.status,
    });
  }
  return NextResponse.json(ok(json), { status: 200 });
}

