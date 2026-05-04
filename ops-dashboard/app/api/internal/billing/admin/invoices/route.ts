import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "all").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "150"), 1), 500);

  const pool = getPool();
  try {
    const rows = await pool.query(
      `SELECT i.id, i.clinic_id, c.name AS clinic_name, i.invoice_no, i.amount_usd::float8 AS amount_usd, i.currency,
              i.status, i.period_start, i.period_end, i.issued_at, i.paid_at,
              r.id AS receipt_id, r.receipt_no, r.payment_method, r.reference_code, r.receipt_url, r.paid_at AS receipt_paid_at
         FROM billing_invoices i
         JOIN clinics c ON c.id = i.clinic_id
         LEFT JOIN billing_receipts r ON r.invoice_id = i.id
        WHERE ($1 = 'all' OR i.status = $1)
        ORDER BY i.issued_at DESC
        LIMIT $2`,
      [status, limit],
    );
    return NextResponse.json({ ok: true, rows: rows.rows });
  } catch {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
