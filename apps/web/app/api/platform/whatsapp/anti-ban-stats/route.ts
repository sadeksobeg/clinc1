import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export async function GET(req: Request) {
  const allowed = await requirePlatformPerm(req, "whatsapp.health.read");
  if (allowed instanceof NextResponse) return allowed;
  const url = new URL(req.url);
  const since = url.searchParams.get("since_hours");
  const path = `/api/internal/platform/whatsapp/anti-ban-stats${since ? `?since_hours=${encodeURIComponent(since)}` : ""}`;
  const upstream = await callOpsApi(req, path, { method: "GET" });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
