import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";

export async function POST(req: Request) {
  const upstream = await callOpsApi(req, "/api/internal/support/sla/recompute", { method: "POST" });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}
