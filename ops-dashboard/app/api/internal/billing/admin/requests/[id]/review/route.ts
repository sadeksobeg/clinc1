import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";

const APPROVE_PHRASE = "CONFIRM_APPROVE_PAYMENT";

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reviewer: z.string().max(120).optional().nullable(),
  review_note: z.string().max(2000).optional().nullable(),
  idempotency_key: z.string().min(8).max(120).optional().nullable(),
  /** P7: required when decision=approve */
  billing_confirm: z.boolean().optional(),
  billing_confirm_phrase: z.string().max(64).optional().nullable(),
});

type Ctx = { params: { id: string } };

export async function POST(req: Request, ctx: Ctx) {
  const startedAt = Date.now();
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const requestId = Number(ctx.params.id);
  if (!Number.isFinite(requestId) || requestId <= 0) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  const idempotencyKey = (parsed.data.idempotency_key || req.headers.get("idempotency-key") || "").trim().slice(0, 120) || null;

  if (parsed.data.decision === "approve") {
    if (!idempotencyKey || idempotencyKey.length < 16) {
      return NextResponse.json(
        { ok: false, error: "billing_idempotency_required", detail: "approve requires idempotency_key min 16 chars" },
        { status: 400 },
      );
    }
    if (parsed.data.billing_confirm !== true || (parsed.data.billing_confirm_phrase || "").trim() !== APPROVE_PHRASE) {
      return NextResponse.json(
        {
          ok: false,
          error: "billing_double_confirm_required",
          detail: `Set billing_confirm=true and billing_confirm_phrase to exact string: ${APPROVE_PHRASE}`,
        },
        { status: 400 },
      );
    }
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reqR = await client.query(
      `SELECT id, clinic_id, amount_usd::float8 AS amount_usd, status, review_idempotency_key, payment_method, reference_code, receipt_url
         FROM clinic_payment_requests
        WHERE id = $1
        FOR UPDATE`,
      [requestId],
    );
    const row = reqR.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (row.status !== "pending") {
      if (idempotencyKey && row.review_idempotency_key === idempotencyKey) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: true, duplicate: true, status: row.status });
      }
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "already_reviewed" }, { status: 409 });
    }

    const nextStatus = parsed.data.decision === "approve" ? "approved" : "rejected";
    await client.query(
      `UPDATE clinic_payment_requests
          SET status = $2,
              reviewed_by = $3,
              reviewed_at = NOW(),
              review_note = $4,
              review_idempotency_key = $5,
              updated_at = NOW()
        WHERE id = $1`,
      [requestId, nextStatus, parsed.data.reviewer ?? null, parsed.data.review_note ?? null, idempotencyKey],
    );

    if (nextStatus === "approved") {
      await client.query(
        `UPDATE clinic_local_subscriptions
            SET status = 'active',
                active_started_at = COALESCE(active_started_at, NOW()),
                suspended_at = NULL,
                suspension_reason = NULL,
                next_renewal_at = NOW() + interval '30 days',
                last_paid_amount_usd = $2,
                last_paid_at = NOW(),
                updated_at = NOW()
          WHERE clinic_id = $1`,
        [row.clinic_id, Number(row.amount_usd || 0)],
      );

      const invoiceR = await client.query<{ id: number; invoice_no: string }>(
        `SELECT id, invoice_no
         FROM billing_invoices
         WHERE payment_request_id = $1
         FOR UPDATE`,
        [requestId],
      );
      const invoiceId = Number(invoiceR.rows[0]?.id || 0);
      if (invoiceId) {
        await client.query(
          `UPDATE billing_invoices
              SET status = 'paid',
                  paid_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1`,
          [invoiceId],
        );
        await client.query(
          `INSERT INTO billing_receipts
             (clinic_id, invoice_id, payment_request_id, receipt_no, payment_method, amount_usd, currency, paid_at, reference_code, receipt_url, metadata)
           VALUES
             ($1, $2, $3, $4, $5, $6, 'USD', NOW(), $7, $8, '{}'::jsonb)
           ON CONFLICT (payment_request_id) DO NOTHING`,
          [
            Number(row.clinic_id),
            invoiceId,
            requestId,
            `RCT-${requestId}-${Date.now().toString(36).toUpperCase()}`,
            String(row.payment_method || "cash"),
            Number(row.amount_usd || 0),
            row.reference_code ?? null,
            row.receipt_url ?? null,
          ],
        );
      }
      await client.query(
        `INSERT INTO trial_funnel_events
          (event, trial_session_id, clinic_id, reason, ts, ts_ms)
         VALUES
          ('trial_paid_conversion', $1, $2, 'billing_approved', NOW(), $3)`,
        [`clinic_${Number(row.clinic_id)}`, Number(row.clinic_id), Date.now()],
      );

    }

    await client.query("COMMIT");

    await insertAuditLog(pool, {
      clinicId: Number(row.clinic_id),
      action: "billing.payment_request.review",
      entityType: "billing_payment_request",
      entityId: String(requestId),
      payload: {
        ok: true,
        decision: parsed.data.decision,
        reviewer: parsed.data.reviewer ?? null,
        idempotency_key: idempotencyKey,
        double_confirm: parsed.data.decision === "approve",
        duration_ms: Date.now() - startedAt,
      },
    });

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
