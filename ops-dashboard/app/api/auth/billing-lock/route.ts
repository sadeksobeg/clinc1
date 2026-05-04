import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getBillingSnapshot } from "@/lib/billing/localBilling";
import { verifyOpsToken } from "@/lib/jwt";
import { assertTokenVersion } from "@/lib/sessionRevocation";

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const tokenPart = cookie
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("ops_session="));
  const token = tokenPart ? decodeURIComponent(tokenPart.slice("ops_session=".length)) : "";
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const payload = await verifyOpsToken(token);
  const clinicId = payload?.clinicId;
  const role = String(payload?.role || "").toLowerCase();
  const scope = payload?.scope || "clinic";
  if (!payload?.sub) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (role === "super_admin" && scope === "platform") {
    return NextResponse.json({
      ok: true,
      clinic_id: null,
      billing_locked: false,
      billing_status: "active",
      trial_ends_at: null,
      scope: "platform",
    });
  }
  if (!clinicId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const pool = getPool();
    const tokenValid = await assertTokenVersion(pool, payload.sub, payload.tokenVersion);
    if (!tokenValid) {
      return NextResponse.json({ ok: false, error: "session_revoked" }, { status: 401 });
    }

    // Presence: treat successful auth checks as "heartbeat"
    await pool
      .query(
        `UPDATE user_sessions
         SET last_seen_at = NOW()
         WHERE user_id = $1
           AND token_version = $2
           AND revoked_at IS NULL`,
        [payload.sub, Number(payload.tokenVersion || 0)],
      )
      .catch(() => undefined);

    const snap = await getBillingSnapshot(pool, clinicId);
    return NextResponse.json({
      ok: true,
      clinic_id: clinicId,
      billing_locked: snap.is_locked,
      billing_status: snap.status,
      trial_ends_at: snap.trial_ends_at,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
