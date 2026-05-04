import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const allowed = await requirePlatformPerm(req, "incidents.read");
  if (allowed instanceof NextResponse) return allowed;

  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const upstream = await callOpsApi(req, `/api/internal/platform/incidents${qs ? `?${qs}` : ""}`, { method: "GET" });
  const json = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !json || json.ok !== true) {
    return NextResponse.json(fail(String(json?.error || "upstream_error"), "Upstream incidents failed", { status: upstream.status }), {
      status: upstream.ok ? 400 : upstream.status,
    });
  }
  return NextResponse.json(ok(json), { status: 200 });
}

export async function POST(req: Request) {
  const allowed = await requirePlatformPerm(req, "incidents.write");
  if (allowed instanceof NextResponse) return allowed;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail("invalid_json", "Invalid JSON"), { status: 400 });
  }
  const upstream = await callOpsApi(req, "/api/internal/platform/incidents", { method: "POST", bodyObject: body });
  const json = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !json || json.ok !== true) {
    return NextResponse.json(fail(String(json?.error || "upstream_error"), "Upstream incident create failed", { status: upstream.status }), {
      status: upstream.ok ? 400 : upstream.status,
    });
  }
  return NextResponse.json(ok(json), { status: 201 });
}

