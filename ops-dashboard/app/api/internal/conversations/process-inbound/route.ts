import { NextResponse } from "next/server";
import { z } from "zod";
import { processInboundMessage } from "@/services/conversation";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { getCorrelationIdFromRequest } from "@/lib/observability/correlation";
import {
  incProductMetric,
  observeProcessInboundLatencyMs,
} from "@/lib/observability/productMetrics";
import { opsLogError } from "@/lib/opsLog";

const bodySchema = z.object({
  clinic_id: z.coerce.number().int().positive().optional(),
  from: z.string().max(512).optional(),
  sender: z.string().max(512).optional(),
  text: z.string().max(16000).optional().default(""),
  messageId: z.string().max(512).optional().default(""),
  receivedAt: z.string().max(64).optional(),
  execute_send: z.boolean().optional(),
  send_urgent_alert: z.boolean().optional(),
  enqueue_on_bridge_failure: z.boolean().optional(),
});

/**
 * Single entry point replacing n8n Normalize + CRM ingest + Scheduling Engine + conversation SQL + send.
 * Auth: Bearer SCHEDULING_SERVICE_TOKEN (same family as inbound-ingest).
 */
export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const correlationId = getCorrelationIdFromRequest(req);
  incProductMetric("process_inbound_total");
  const t0 = Date.now();
  try {
    const pool = getPool();
    const result = await processInboundMessage(pool, parsed.data, { correlationId });
    observeProcessInboundLatencyMs(Date.now() - t0);
    if (result.duplicate) incProductMetric("process_inbound_duplicate_total");
    if (!result.ok && result.error === "missing_sender") {
      return NextResponse.json({ ...result, correlation_id: correlationId }, { status: 400 });
    }
    const status =
      result.queued &&
      (result.defer_reason === "lock_contended" || result.defer_reason === "conversation_lock_contended")
        ? 202
        : 200;
    return NextResponse.json({ ...result, correlation_id: correlationId }, { status });
  } catch (e) {
    incProductMetric("process_inbound_error_total");
    observeProcessInboundLatencyMs(Date.now() - t0);
    opsLogError("internal/conversations/process-inbound", e, { correlation_id: correlationId });
    return NextResponse.json(
      { ok: false, error: "internal_error", correlation_id: correlationId },
      { status: 500 },
    );
  }
}
