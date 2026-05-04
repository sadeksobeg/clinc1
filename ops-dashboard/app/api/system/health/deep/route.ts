import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertDeepHealthToken } from "@/lib/internalAuth";
import { runDeepHealth } from "@/lib/system/deepHealth";

/**
 * Dependency + stream lag probe. Protected by Bearer HEALTH_DEEP_TOKEN or SCHEDULING_SERVICE_TOKEN.
 */
export async function GET(req: Request) {
  const auth = assertDeepHealthToken(req);
  if (auth) return auth;
  try {
    const pool = getPool();
    const report = await runDeepHealth(pool);
    const code = report.status === "down" ? 503 : 200;
    return NextResponse.json(report, { status: code });
  } catch (e) {
    return NextResponse.json(
      { status: "down", error: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
