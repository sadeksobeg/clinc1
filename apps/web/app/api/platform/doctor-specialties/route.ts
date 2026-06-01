import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export async function GET(req: Request) {
  const allowed = await requirePlatformPerm(req, "doctors.read");
  if (allowed instanceof NextResponse) return allowed;
  const url = new URL(req.url);
  const did = url.searchParams.get("doctor_id") || "";
  const upstream = await callOpsApi(
    req,
    `/api/internal/platform/doctor-specialties${did ? `?doctor_id=${encodeURIComponent(did)}` : ""}`,
    { method: "GET" },
  );
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(req: Request) {
  const allowed = await requirePlatformPerm(req, "doctors.write");
  if (allowed instanceof NextResponse) return allowed;
  const upstream = await callOpsApi(req, "/api/internal/platform/doctor-specialties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await req.text(),
  });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
