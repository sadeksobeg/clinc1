import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

type Ctx = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  const allowed = await requirePlatformPerm(req, "incidents.read");
  if (allowed instanceof NextResponse) return allowed;
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json(fail("bad_id", "Bad incident id"), { status: 400 });

  const upstream = await callOpsApi(req, `/api/internal/platform/incidents/${id}/events`, { method: "GET" });
  const json = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !json || json.ok !== true) {
    return NextResponse.json(fail(String(json?.error || "upstream_error"), "Upstream events failed", { status: upstream.status }), {
      status: upstream.ok ? 400 : upstream.status,
    });
  }
  return NextResponse.json(ok(json), { status: 200 });
}

