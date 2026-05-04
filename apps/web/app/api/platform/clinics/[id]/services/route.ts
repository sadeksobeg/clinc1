import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

type Ctx = { params: { id: string } };

export async function GET(req: Request, ctx: Ctx) {
  const allowed = await requirePlatformPerm(req, "clinic.services.read");
  if (allowed instanceof NextResponse) return allowed;
  const clinicId = Number(ctx.params.id);
  const upstream = await callOpsApi(req, `/api/internal/platform/clinics/${clinicId}/services`, { method: "GET" });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(req: Request, ctx: Ctx) {
  const allowed = await requirePlatformPerm(req, "clinic.services.write");
  if (allowed instanceof NextResponse) return allowed;
  const clinicId = Number(ctx.params.id);
  const upstream = await callOpsApi(req, `/api/internal/platform/clinics/${clinicId}/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await req.text(),
  });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

