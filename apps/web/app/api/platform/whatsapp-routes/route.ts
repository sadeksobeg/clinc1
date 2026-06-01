import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export async function GET(req: Request) {
  const allowed = await requirePlatformPerm(req, "whatsapp_routing.read");
  if (allowed instanceof NextResponse) return allowed;
  const upstream = await callOpsApi(req, "/api/internal/platform/whatsapp-routes", { method: "GET" });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(req: Request) {
  const allowed = await requirePlatformPerm(req, "whatsapp_routing.write");
  if (allowed instanceof NextResponse) return allowed;
  const upstream = await callOpsApi(req, "/api/internal/platform/whatsapp-routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await req.text(),
  });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function DELETE(req: Request) {
  const allowed = await requirePlatformPerm(req, "whatsapp_routing.write");
  if (allowed instanceof NextResponse) return allowed;
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const upstream = await callOpsApi(
    req,
    `/api/internal/platform/whatsapp-routes?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
