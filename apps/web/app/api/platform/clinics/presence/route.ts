import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export async function GET(req: Request) {
  const allowed = await requirePlatformPerm(req, "clinic.read");
  if (allowed instanceof NextResponse) return allowed;

  const url = new URL(req.url);
  const windowMinutes = url.searchParams.get("window_minutes");
  const qs = windowMinutes ? `?window_minutes=${encodeURIComponent(windowMinutes)}` : "";

  const upstream = await callOpsApi(req, `/api/internal/platform/clinics/presence${qs}`, { method: "GET" });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

