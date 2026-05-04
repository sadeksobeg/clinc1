import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(300, Math.max(20, Number(url.searchParams.get("limit") || "120")));
  const upstream = await callOpsApi(req, `/api/internal/system/timeline?limit=${limit}`, { method: "GET" });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}
