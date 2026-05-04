import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";

type Ctx = { params: { id: string } };

export async function POST(req: Request, ctx: Ctx) {
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  }
  const upstream = await callOpsApi(req, `/api/internal/jobs/${id}/cancel`, { method: "POST" });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}
