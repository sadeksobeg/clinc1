import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";

export const dynamic = "force-dynamic";

/** Service-token patient list for BFF (apps/web). */
export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const url = new URL(req.url);
  const clinicId = Math.max(1, Number.parseInt(url.searchParams.get("clinic_id") || "1", 10) || 1);
  const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "100", 10) || 100));
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT id, chat_id, regexp_replace(chat_id, '\\D', '', 'g') AS wa_phone_digits,
              display_name, phone_e164, status, birth_date, gender, city, is_vip, is_blacklisted,
              first_seen_at, last_seen_at
       FROM patients
       WHERE clinic_id = $1 AND deleted_at IS NULL
       ORDER BY last_seen_at DESC NULLS LAST
       LIMIT $2`,
      [clinicId, limit],
    );
    return NextResponse.json({ ok: true, rows: r.rows });
  } catch (e) {
    opsLogError("internal/patients", e, { clinic_id: clinicId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
