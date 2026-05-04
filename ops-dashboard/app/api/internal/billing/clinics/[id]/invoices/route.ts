import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

type Ctx = { params: { id: string } };

export async function GET(req: Request, ctx: Ctx) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }
  const pool = getPool();
  try {
    const rows = await pool.query(
      `SELECT i.id, i.invoice_no, i.amount_usd::float8 AS amount_usd, i.currency, i.status, i.period_start, i.period_end,
              i.issued_at, i.paid_at, i.payment_request_id,
              r.id AS receipt_id, r.receipt_no, r.payment_method, r.reference_code, r.receipt_url, r.paid_at AS receipt_paid_at
         FROM billing_invoices i
         LEFT JOIN billing_receipts r ON r.invoice_id = i.id
        WHERE i.clinic_id = $1
        ORDER BY i.issued_at DESC
        LIMIT 100`,
      [clinicId],
    );
    return NextResponse.json({ ok: true, rows: rows.rows });
  } catch {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
