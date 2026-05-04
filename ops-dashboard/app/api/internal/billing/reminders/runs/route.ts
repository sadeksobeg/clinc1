import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

type RunRow = {
  id: number;
  trigger_source: string;
  status: string;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  error_text: string | null;
  started_at: string;
  ended_at: string | null;
};

export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const pool = getPool();
  const rows = await pool.query<RunRow>(
    `SELECT id, trigger_source, status, sent_count, failed_count, skipped_count, error_text, started_at, ended_at
     FROM billing_reminder_runs
     ORDER BY started_at DESC
     LIMIT 30`,
  );
  return NextResponse.json({ ok: true, runs: rows.rows });
}
