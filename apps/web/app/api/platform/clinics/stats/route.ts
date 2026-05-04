import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const allowed = await requirePlatformPerm(req, "clinic.read");
  if (allowed instanceof NextResponse) return allowed;

  const upstream = await callOpsApi(req, `/api/internal/platform/clinics/stats`, { method: "GET" });
  const json = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !json || json.ok !== true) {
    return NextResponse.json(fail(String(json?.error || "upstream_error"), "Upstream clinic stats failed", { status: upstream.status }), {
      status: upstream.ok ? 400 : upstream.status,
    });
  }
  return NextResponse.json(ok({ clinics: Array.isArray(json.clinics) ? json.clinics : [] }), { status: 200 });
}

