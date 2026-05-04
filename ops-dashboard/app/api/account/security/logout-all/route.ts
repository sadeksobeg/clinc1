import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifyOpsToken } from "@/lib/jwt";
import { bumpTokenVersion, revokeSessionsBeforeVersion } from "@/lib/sessionRevocation";

function readToken(req: Request): string {
  const cookie = req.headers.get("cookie") || "";
  const item = cookie
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("ops_session="));
  return item ? decodeURIComponent(item.slice("ops_session=".length)) : "";
}

export async function POST(req: Request) {
  const token = readToken(req);
  const payload = token ? await verifyOpsToken(token) : null;
  if (!payload?.sub) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const pool = getPool();
    const nextVersion = await bumpTokenVersion(pool, payload.sub);
    if (nextVersion > 0) {
      await revokeSessionsBeforeVersion(pool, payload.sub, nextVersion);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "logout_all_failed" }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true, note: "all_sessions_revoked" });
  res.cookies.set("ops_session", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
