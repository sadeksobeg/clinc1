import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export async function GET(req: Request) {
  const allowed = await requirePlatformPerm(req, "clinic.read");
  if (allowed instanceof NextResponse) return allowed;
  const upstream = await callOpsApi(req, "/api/internal/scheduling/clinics", { method: "GET" });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
