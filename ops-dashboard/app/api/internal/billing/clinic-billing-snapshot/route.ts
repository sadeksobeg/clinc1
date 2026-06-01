import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { getBillingSnapshot } from "@/lib/billing/localBilling";

export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  const url = new URL(req.url);
  const clinicId = Number(req.headers.get("x-clinic-id") || url.searchParams.get("clinic_id") || 0);
  if (!Number.isFinite(clinicId) || clinicId <= 0) {
    return NextResponse.json({ ok: false, error: "clinic_id required" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const snapshot = await getBillingSnapshot(pool, clinicId);
    const invoices = await pool.query(
      `SELECT id, invoice_no, amount_usd::float8 AS amount_usd, currency, status, issued_at, paid_at
         FROM billing_invoices
        WHERE clinic_id = $1
        ORDER BY issued_at DESC
        LIMIT 20`,
      [clinicId],
    );
    return NextResponse.json({
      ok: true,
      snapshot,
      invoices: invoices.rows,
      source: "ops_local_billing",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
