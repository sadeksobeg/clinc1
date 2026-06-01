import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export async function GET(req: Request) {
  const allowed = await requirePlatformPerm(req, "clinic.services.read");
  if (allowed instanceof NextResponse) return allowed;
  const url = new URL(req.url);
  const cid = url.searchParams.get("clinic_id") || "";
  const upstream = await callOpsApi(
    req,
    `/api/internal/platform/clinic-specialties${cid ? `?clinic_id=${encodeURIComponent(cid)}` : ""}`,
    { method: "GET" },
  );
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(req: Request) {
  const allowed = await requirePlatformPerm(req, "clinic.services.write");
  if (allowed instanceof NextResponse) return allowed;
  const upstream = await callOpsApi(req, "/api/internal/platform/clinic-specialties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await req.text(),
  });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
