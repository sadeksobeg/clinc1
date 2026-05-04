import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";
import { getBillingSnapshot, type LocalPaymentMethod } from "@/lib/billing/localBilling";

const createRequestSchema = z.object({
  payment_method: z.enum(["cash", "shamcash", "manual_transfer"]),
  amount_usd: z.number().positive().max(100000),
  receipt_url: z.string().url().max(2000).optional().nullable(),
  reference_code: z.string().max(120).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  requested_by: z.string().max(120).optional().nullable(),
  request_type: z.enum(["activation", "renewal"]).optional(),
  idempotency_key: z.string().min(8).max(120).optional().nullable(),
});

type Ctx = { params: { id: string } };

function cleanIdempotencyKey(req: Request, bodyKey?: string | null): string | null {
  const hdr = req.headers.get("idempotency-key");
  const v = (bodyKey || hdr || "").trim();
  return v ? v.slice(0, 120) : null;
}

function invoiceNo(clinicId: number): string {
  return `INV-${clinicId}-${Date.now().toString(36).toUpperCase()}`;
}

export async function GET(req: Request, ctx: Ctx) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const clinicR = await pool.query(
      `SELECT id, slug, name, metadata
       FROM clinics
       WHERE id = $1 AND deleted_at IS NULL`,
      [clinicId],
    );
    if (!clinicR.rows[0]) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const snapshot = await getBillingSnapshot(pool, clinicId);
    const requests = await pool.query(
      `SELECT id, request_type, payment_method, amount_usd::float8 AS amount_usd, currency, receipt_url, reference_code,
              note, status, requested_by, requested_at, reviewed_by, reviewed_at, review_note, idempotency_key
         FROM clinic_payment_requests
        WHERE clinic_id = $1
        ORDER BY requested_at DESC
        LIMIT 40`,
      [clinicId],
    );

    const invoices = await pool.query(
      `SELECT i.id, i.invoice_no, i.amount_usd::float8 AS amount_usd, i.currency, i.status, i.issued_at, i.paid_at,
              i.payment_request_id, r.receipt_no, r.payment_method, r.reference_code, r.receipt_url
         FROM billing_invoices i
         LEFT JOIN billing_receipts r ON r.invoice_id = i.id
        WHERE i.clinic_id = $1
        ORDER BY i.issued_at DESC
        LIMIT 60`,
      [clinicId],
    );

    return NextResponse.json({ ok: true, clinic: clinicR.rows[0], snapshot, payment_requests: requests.rows, invoices: invoices.rows });
  } catch {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const startedAt = Date.now();
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createRequestSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

  try {
    const pool = getPool();
    const snapshot = await getBillingSnapshot(pool, clinicId);
    const method = parsed.data.payment_method as LocalPaymentMethod;
    const amount = Number(parsed.data.amount_usd || snapshot.estimated_total_usd);
    const requestType = parsed.data.request_type ?? (snapshot.status === "trial" || snapshot.status === "trial_expiring" ? "activation" : "renewal");
    const idemKey = cleanIdempotencyKey(req, parsed.data.idempotency_key);

    if (idemKey) {
      const existing = await pool.query(
        `SELECT id, request_type, payment_method, amount_usd::float8 AS amount_usd, status, requested_at
         FROM clinic_payment_requests
         WHERE clinic_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [clinicId, idemKey],
      );
      if (existing.rows[0]) {
        return NextResponse.json({ ok: true, duplicate: true, request: existing.rows[0] });
      }
    }

    const subR = await pool.query<{ id: number }>(
      `SELECT id FROM clinic_local_subscriptions WHERE clinic_id = $1 LIMIT 1`,
      [clinicId],
    );
    const subId = Number(subR.rows[0]?.id || 0) || null;

    const ins = await pool.query(
      `INSERT INTO clinic_payment_requests (
         clinic_id, subscription_id, request_type, payment_method, amount_usd, currency,
         receipt_url, reference_code, note, status, requested_by, idempotency_key, requested_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'USD',
         $6, $7, $8, 'pending', $9, $10, NOW(), NOW()
       )
       RETURNING id, request_type, payment_method, amount_usd::float8 AS amount_usd, status, requested_at, idempotency_key`,
      [
        clinicId,
        subId,
        requestType,
        method,
        amount,
        parsed.data.receipt_url ?? null,
        parsed.data.reference_code ?? null,
        parsed.data.note ?? null,
        parsed.data.requested_by ?? null,
        idemKey,
      ],
    );
    const requestId = Number(ins.rows[0]?.id || 0);

    const invoiceR = await pool.query(
      `INSERT INTO billing_invoices
         (clinic_id, subscription_id, payment_request_id, invoice_no, period_start, period_end, due_at,
          amount_usd, currency, status, issued_at, updated_at)
       VALUES
         ($1, $2, $3, $4, date_trunc('month', NOW())::date, (date_trunc('month', NOW()) + interval '1 month - 1 day')::date, NOW() + interval '3 days',
          $5, 'USD', 'issued', NOW(), NOW())
       ON CONFLICT (payment_request_id) DO NOTHING
       RETURNING id, invoice_no`,
      [clinicId, subId, requestId, invoiceNo(clinicId), amount],
    );

    await insertAuditLog(pool, {
      clinicId,
      action: "billing.payment_request.create",
      entityType: "billing_payment_request",
      entityId: String(ins.rows[0]?.id ?? ""),
      payload: {
        ok: true,
        payment_method: method,
        amount_usd: amount,
        idempotency_key: idemKey,
        invoice_id: Number(invoiceR.rows[0]?.id || 0) || null,
        duration_ms: Date.now() - startedAt,
      },
    });

    return NextResponse.json({ ok: true, request: ins.rows[0] });
  } catch {
    await insertAuditLog(getPool(), {
      clinicId,
      action: "billing.payment_request.create",
      entityType: "billing_payment_request",
      payload: { ok: false, duration_ms: Date.now() - startedAt },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
