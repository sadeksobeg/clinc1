import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { requirePlatformPerm } from "@/lib/platform/platformPerms";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).optional().default(100) });

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });
  const perm = await requirePlatformPerm(req, "decision.read");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ limit: url.searchParams.get("limit") ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query", details: parsed.error.flatten() }, { status: 400 });

  const pool = getPool();
  const rows = await pool.query(
    `SELECT id, name, description, rule_expression, suggested_action_type, risk_level, enabled, created_at
       FROM platform_decision_rules
      ORDER BY id DESC
      LIMIT $1`,
    [parsed.data.limit],
  );
  return NextResponse.json({ ok: true, rules: rows.rows });
}

