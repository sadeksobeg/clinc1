import { NextResponse } from "next/server";
import { callOpsApi, requireUserSession } from "@/lib/secure-api";

export type PlatformPermCheck = { role: string; perms: string[] };

export async function requirePlatformPerm(req: Request, perm: string): Promise<PlatformPermCheck | NextResponse> {
  const session = await requireUserSession(req);
  if (session instanceof NextResponse) return session;
  if (session.scope !== "platform") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  // Fetch current permissions from ops-dashboard (source of truth).
  const upstream = await callOpsApi(req, "/api/internal/platform/me/permissions", { method: "GET" });
  const json = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !json || json.ok !== true) {
    return NextResponse.json({ ok: false, error: "permissions_unavailable" }, { status: 502 });
  }
  const perms = Array.isArray(json.perms) ? json.perms.map((x: any) => String(x)) : [];
  const role = String(json.role || "");
  const allowed = perms.includes("*") || perms.includes(perm);
  if (!allowed) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  return { role, perms };
}

