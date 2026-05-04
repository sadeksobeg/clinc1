import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

function readActor(req: Request): number | null {
  const v = Number(req.headers.get("x-user-id") || 0);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function arrayStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter((x) => x.length > 0);
}

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const actor = readActor(req);
  if (!actor) return NextResponse.json({ ok: false, error: "missing_actor" }, { status: 400 });

  const pool = getPool();
  const r = await pool.query(`SELECT id, role, security_flags FROM staff_users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [actor]);
  const row = r.rows[0] as { id: number; role: string; security_flags?: Record<string, unknown> } | undefined;
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const role = String(row.role || "");
  const flags = (row.security_flags || {}) as Record<string, unknown>;
  const platformScopeEnabled = flags.platform_scope === true;
  if (!platformScopeEnabled && role.toLowerCase() !== "super_admin") {
    return NextResponse.json({ ok: false, error: "platform_scope_not_enabled" }, { status: 403 });
  }

  const perms = role.toLowerCase() === "super_admin" ? ["*"] : arrayStrings(flags.platform_perms);
  return NextResponse.json({ ok: true, role, perms }, { status: 200 });
}

