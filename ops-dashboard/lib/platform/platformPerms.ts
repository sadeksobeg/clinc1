import { getPool } from "@/lib/db";

export async function requirePlatformPerm(req: Request, perm: string): Promise<{ actor: number; ok: true } | { ok: false; status: number; error: string }> {
  const actor = Number(req.headers.get("x-user-id") || 0);
  if (!Number.isFinite(actor) || actor <= 0) return { ok: false, status: 400, error: "missing_actor" };
  const pool = getPool();
  const r = await pool.query(`SELECT role, security_flags FROM staff_users WHERE id=$1 AND deleted_at IS NULL LIMIT 1`, [actor]);
  const row = r.rows[0] as { role: string; security_flags?: Record<string, unknown> } | undefined;
  if (!row) return { ok: false, status: 403, error: "actor_not_found" };
  if (String(row.role || "").toLowerCase() === "super_admin") return { actor, ok: true };
  const perms = Array.isArray((row.security_flags as any)?.platform_perms) ? ((row.security_flags as any).platform_perms as unknown[]) : [];
  const has = perms.map((x) => String(x)).includes(perm);
  if (!has) return { ok: false, status: 403, error: "forbidden" };
  return { actor, ok: true };
}

