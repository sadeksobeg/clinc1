import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  try {
    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "pending").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "100"), 1), 300);

    const pool = getPool();
    const rows = await pool.query(
      `SELECT r.id, r.clinic_id, c.name AS clinic_name, r.request_type, r.payment_method,
              r.amount_usd::float8 AS amount_usd, r.currency, r.receipt_url, r.reference_code,
              r.note, r.status, r.requested_by, r.requested_at, r.reviewed_by, r.reviewed_at, r.review_note
         FROM clinic_payment_requests r
         JOIN clinics c ON c.id = r.clinic_id
        WHERE ($1 = 'all' OR r.status = $1)
        ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.requested_at DESC
        LIMIT $2`,
      [status, limit],
    );
    return NextResponse.json({ ok: true, rows: rows.rows });
  } catch {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
