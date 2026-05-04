import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";

export async function GET(req: Request) {
  const upstream = await callOpsApi(req, "/api/internal/notifications", { method: "GET" });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const upstream = await callOpsApi(req, "/api/internal/notifications", { method: "POST", bodyObject: body });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const upstream = await callOpsApi(req, "/api/internal/notifications", { method: "PATCH", bodyObject: body });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}
