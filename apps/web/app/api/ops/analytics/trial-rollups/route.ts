import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const granularity = url.searchParams.get("granularity") || "day";
  const limit = Math.min(500, Math.max(20, Number(url.searchParams.get("limit") || "200")));
  const upstream = await callOpsApi(req, `/api/internal/analytics/trial/rollups?granularity=${encodeURIComponent(granularity)}&limit=${limit}`, {
    method: "GET",
  });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}

export async function POST(req: Request) {
  const upstream = await callOpsApi(req, "/api/internal/analytics/trial/rollups/compute", { method: "POST" });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}
