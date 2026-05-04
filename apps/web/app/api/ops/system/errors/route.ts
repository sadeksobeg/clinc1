import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") || "50")));
  const upstream = await callOpsApi(req, `/api/internal/system/errors?limit=${limit}`, { method: "GET" });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}
