import { NextResponse } from "next/server";
import { callOpsApi, requireUserSession } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";

type Ctx = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  const session = await requireUserSession(req);
  if (session instanceof NextResponse) return session;
  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json(fail("bad_id", "Bad clinic id"), { status: 400 });

  const upstream = await callOpsApi(req, `/api/internal/billing/clinics/${clinicId}`, { method: "GET" });
  const json = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !json || json.ok !== true) {
    return NextResponse.json(fail(String(json?.error || "upstream_error"), "Upstream billing clinic failed", { status: upstream.status }), {
      status: upstream.ok ? 400 : upstream.status,
    });
  }
  return NextResponse.json(ok(json), { status: 200 });
}

