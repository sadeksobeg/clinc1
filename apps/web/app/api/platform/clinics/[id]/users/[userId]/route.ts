import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

type Ctx = { params: { id: string; userId: string } };

export async function PATCH(req: Request, ctx: Ctx) {
  const allowed = await requirePlatformPerm(req, "clinic.users.write");
  if (allowed instanceof NextResponse) return allowed;
  const clinicId = Number(ctx.params.id);
  const userId = Number(ctx.params.userId);
  const upstream = await callOpsApi(req, `/api/internal/platform/clinics/${clinicId}/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: await req.text(),
  });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const allowed = await requirePlatformPerm(req, "clinic.users.write");
  if (allowed instanceof NextResponse) return allowed;
  const clinicId = Number(ctx.params.id);
  const userId = Number(ctx.params.userId);
  const upstream = await callOpsApi(req, `/api/internal/platform/clinics/${clinicId}/users/${userId}`, { method: "DELETE" });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

