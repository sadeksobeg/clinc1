import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(req: Request, ctx: Ctx) {
  const allowed = await requirePlatformPerm(req, "action.read");
  if (allowed instanceof NextResponse) return allowed;

  const id = Number(ctx.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json(fail("bad_id", "Bad action id", { status: 400 }), { status: 400 });
  }

  const upstream = await callOpsApi(req, `/api/internal/platform/actions/${id}/results`, { method: "GET" });
  const json = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !json || json.ok !== true) {
    return NextResponse.json(fail(String(json?.error || "upstream_error"), "Upstream action results failed", { status: upstream.status }), {
      status: upstream.ok ? 400 : upstream.status,
    });
  }
  return NextResponse.json(ok(json), { status: 200 });
}

