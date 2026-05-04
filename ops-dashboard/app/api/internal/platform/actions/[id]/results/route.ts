import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { requirePlatformPerm } from "@/lib/platform/platformPerms";

type Ctx = { params: { id: string } };

export async function GET(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const perm = await requirePlatformPerm(req, "action.read");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  const id = Number(ctx.params.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const pool = getPool();
  const r = await pool.query(
    `SELECT id, action_id, success, verification_status, metrics_after, verified_at
       FROM platform_action_results
      WHERE action_id = $1
      LIMIT 1`,
    [id],
  );
  return NextResponse.json({ ok: true, result: r.rows[0] ?? null });
}

