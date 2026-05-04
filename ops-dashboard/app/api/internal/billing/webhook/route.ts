import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";

const eventSchema = z.object({
  id: z.string().min(8).max(160),
  event_type: z.enum(["payment.approved", "payment.rejected"]),
  request_id: z.number().int().positive(),
  amount_usd: z.number().positive().max(100000).optional(),
  event_ts: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

function isFreshTimestamp(tsHeader: string | null, windowSec = 300): boolean {
  if (!tsHeader) return false;
  const ts = Number(tsHeader);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= windowSec;
}

function safeEqualHex(expectedHex: string, receivedHex: string): boolean {
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(receivedHex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifySignature(rawBody: string, tsHeader: string | null, sigHeader: string | null): boolean {
  const secret = process.env.BILLING_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  if (!isFreshTimestamp(tsHeader)) return false;
  if (!sigHeader) return false;
  const signed = `${tsHeader}.${rawBody}`;
  const digest = createHmac("sha256", secret).update(signed).digest("hex");
  return safeEqualHex(digest, sigHeader.trim().toLowerCase());
}

export async function POST(req: Request) {
  const authErr = assertSchedulingServiceToken(req);
  if (authErr) return authErr;

  const raw = await req.text().catch(() => "");
  if (!raw) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  const tsHeader = req.headers.get("x-billing-timestamp");
  const sigHeader = req.headers.get("x-billing-signature");
  if (!verifySignature(raw, tsHeader, sigHeader)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }

  const event = parsed.data;
  const provider = "generic_webhook";
  const payloadHash = createHash("sha256").update(raw).digest("hex");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingEvent = await client.query(
      `SELECT id, status
       FROM billing_processed_events
       WHERE provider = $1 AND event_id = $2
       LIMIT 1
       FOR UPDATE`,
      [provider, event.id],
    );
    if (existingEvent.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: true, duplicate: true, event_id: event.id });
    }

    await client.query(
      `INSERT INTO billing_processed_events
        (provider, event_id, event_type, event_ts, payload_hash, status, metadata)
       VALUES
        ($1, $2, $3, $4, $5, 'processed', $6::jsonb)`,
      [provider, event.id, event.event_type, event.event_ts ?? null, payloadHash, JSON.stringify(event.metadata ?? {})],
    );

    const reqR = await client.query(
      `SELECT id, clinic_id, amount_usd::float8 AS amount_usd, status, payment_method, reference_code, receipt_url
       FROM clinic_payment_requests
       WHERE id = $1
       FOR UPDATE`,
      [event.request_id],
    );
    const requestRow = reqR.rows[0];
    if (!requestRow) {
      await client.query(
        `UPDATE billing_processed_events
         SET status = 'ignored', error_text = 'request_not_found'
         WHERE provider = $1 AND event_id = $2`,
        [provider, event.id],
      );
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, ignored: true, reason: "request_not_found" });
    }

    const nextStatus = event.event_type === "payment.approved" ? "approved" : "rejected";
    const requestStatus = String(requestRow.status || "");
    if (requestStatus !== "pending") {
      await client.query(
        `UPDATE billing_processed_events
         SET status = 'ignored', error_text = 'already_reviewed'
         WHERE provider = $1 AND event_id = $2`,
        [provider, event.id],
      );
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, ignored: true, reason: "already_reviewed" });
    }

    await client.query(
      `UPDATE clinic_payment_requests
          SET status = $2,
              reviewed_by = 'webhook',
              reviewed_at = NOW(),
              review_note = $3,
              review_idempotency_key = $4,
              updated_at = NOW()
        WHERE id = $1`,
      [event.request_id, nextStatus, `Processed from webhook event ${event.id}`, `webhook:${provider}:${event.id}`],
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
        [Number(requestRow.clinic_id), Number(event.amount_usd ?? requestRow.amount_usd ?? 0)],
      );

      const invoiceR = await client.query<{ id: number; invoice_no: string }>(
        `SELECT id, invoice_no
         FROM billing_invoices
         WHERE payment_request_id = $1
         FOR UPDATE`,
        [event.request_id],
      );
      const invoiceId = Number(invoiceR.rows[0]?.id || 0);
      if (invoiceId) {
        await client.query(
          `UPDATE billing_invoices
           SET status = 'paid', paid_at = NOW(), updated_at = NOW()
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
            Number(requestRow.clinic_id),
            invoiceId,
            event.request_id,
            `RCT-${event.request_id}-${Date.now().toString(36).toUpperCase()}`,
            String(requestRow.payment_method || "cash"),
            Number(event.amount_usd ?? requestRow.amount_usd ?? 0),
            requestRow.reference_code ?? null,
            requestRow.receipt_url ?? null,
          ],
        );
      }
      await client.query(
        `INSERT INTO trial_funnel_events
          (event, trial_session_id, clinic_id, reason, ts, ts_ms)
         VALUES
          ('trial_paid_conversion', $1, $2, 'billing_webhook_approved', NOW(), $3)`,
        [`clinic_${Number(requestRow.clinic_id)}`, Number(requestRow.clinic_id), Date.now()],
      );
    }

    await client.query("COMMIT");
    await insertAuditLog(pool, {
      clinicId: Number(requestRow.clinic_id),
      actorType: "system",
      action: "billing.webhook.processed",
      entityType: "billing_processed_event",
      entityId: event.id,
      payload: { request_id: event.request_id, event_type: event.event_type, next_status: nextStatus },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, processed: true, status: nextStatus });
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    await pool
      .query(
        `INSERT INTO billing_processed_events
          (provider, event_id, event_type, payload_hash, status, error_text)
         VALUES ($1, $2, $3, $4, 'failed', 'internal_error')
         ON CONFLICT (provider, event_id) DO UPDATE
         SET status = 'failed',
             error_text = 'internal_error'`,
        [provider, event.id, event.event_type, payloadHash],
      )
      .catch(() => undefined);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
