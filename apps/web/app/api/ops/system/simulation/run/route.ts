import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";

export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const upstream = await callOpsApi(req, "/api/internal/system/simulation/run", { method: "POST", bodyObject: body });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}
