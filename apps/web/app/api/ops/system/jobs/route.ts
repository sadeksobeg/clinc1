import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "all";
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit") || "100")));
  const queueKey = url.searchParams.get("queue_key");
  const q = new URLSearchParams({ status, limit: String(limit) });
  if (queueKey) q.set("queue_key", queueKey);
  const upstream = await callOpsApi(req, `/api/internal/jobs?${q.toString()}`, { method: "GET" });
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
  const upstream = await callOpsApi(req, "/api/internal/jobs", { method: "POST", bodyObject: body });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}
