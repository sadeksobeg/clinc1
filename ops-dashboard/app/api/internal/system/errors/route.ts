import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") || "50")));
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, fingerprint, severity, first_seen_at, last_seen_at, occurrences, sample_error
     FROM error_aggregations
     ORDER BY last_seen_at DESC
     LIMIT $1`,
    [limit],
  );
  return NextResponse.json({ ok: true, errors: r.rows });
}
