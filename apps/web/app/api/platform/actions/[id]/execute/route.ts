import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

type Ctx = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: Ctx) {
  const allowed = await requirePlatformPerm(req, "action.execute");
  if (allowed instanceof NextResponse) return allowed;
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json(fail("bad_id", "Bad action id"), { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail("invalid_json", "Invalid JSON"), { status: 400 });
  }

  const upstream = await callOpsApi(req, `/api/internal/platform/actions/${id}/execute`, { method: "POST", bodyObject: body });
  const json = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !json || json.ok !== true) {
    return NextResponse.json(fail(String(json?.error || "upstream_error"), "Upstream execute failed", { status: upstream.status }), {
      status: upstream.ok ? 400 : upstream.status,
    });
  }
  return NextResponse.json(ok(json), { status: 200 });
}

