import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const limit = Math.min(100, Math.max(10, Number(new URL(req.url).searchParams.get("limit") || "30")));
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, scenario_name, status, config, metrics, started_at, ended_at
     FROM production_simulation_runs
     ORDER BY started_at DESC
     LIMIT $1`,
    [limit],
  );
  return NextResponse.json({ ok: true, runs: r.rows });
}
