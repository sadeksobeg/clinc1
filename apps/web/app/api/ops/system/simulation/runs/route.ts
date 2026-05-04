import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";

export async function GET(req: Request) {
  const limit = Math.min(100, Math.max(10, Number(new URL(req.url).searchParams.get("limit") || "30")));
  const upstream = await callOpsApi(req, `/api/internal/system/simulation/runs?limit=${limit}`, { method: "GET" });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}
