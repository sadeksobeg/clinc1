import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { getDefaultMessagingAdapter } from "@/lib/messaging/WhatsAppWebAdapter";
import { getCorrelationIdFromRequest } from "@/lib/observability/correlation";
import { incProductMetric } from "@/lib/observability/productMetrics";
import { claimCoreOutboxBatch, markOutboxBlocked, markOutboxFailed, markOutboxSent } from "@/lib/outbox/coreOutbox";
import { evaluateOutboxRowForSend, resolvePatientIdForOutbox } from "@/lib/outbox/outboxReplyGate";
import { opsLogError } from "@/lib/opsLog";
import { getLastPatientInboundAt } from "@/lib/whatsapp/replyWindow";
import { markReminderSent } from "@/lib/scheduling/reminderActions";

const bodySchema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(20),
});

/**
 * Claims pending `core_outbox` rows and dispatches `whatsapp_send` jobs to the bridge.
 * Intended for cron / internal automation using SCHEDULING_SERVICE_TOKEN.
 */
export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  let json: unknown = {};
  try {
    const t = await req.text();
    if (t.trim()) json = JSON.parse(t) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const correlationId = getCorrelationIdFromRequest(req);
    const pool = getPool();
    const messaging = getDefaultMessagingAdapter();
    const batch = await claimCoreOutboxBatch(pool, parsed.data.limit);
    let sent = 0;
    let failed = 0;
    let blocked = 0;
    for (const row of batch) {
      if (row.job_type !== "whatsapp_send") {
        await markOutboxBlocked(pool, row.id, `policy_blocked:unsupported_job_type:${row.job_type}`);
        blocked += 1;
        incProductMetric("outbox_drain_blocked_total");
        continue;
      }
      const to = String(row.payload.to || "");
      const text = String(row.payload.text || "");
      if (!to || !text) {
        await markOutboxFailed(pool, row.id, "missing_to_or_text");
        failed += 1;
        incProductMetric("outbox_drain_failed_total");
        continue;
      }
      const gate = await evaluateOutboxRowForSend(pool, row);
      if (!gate.send) {
        blocked += 1;
        incProductMetric("outbox_drain_blocked_total");
        continue;
      }
      const kind = row.payload.kind;
      const bridgePolicy =
        typeof kind === "string" && kind === "urgent_alert"
          ? ({ kind: "staff_alert" } as const)
          : await (async () => {
              const pid = await resolvePatientIdForOutbox(pool, row);
              const lastAt =
                pid != null
                  ? await getLastPatientInboundAt(pool, { clinicId: row.clinic_id, patientId: pid })
                  : null;
              return { kind: "patient_proactive" as const, lastInboundAt: lastAt };
            })();
      const r = await messaging.send({
        to,
        text,
        policy: bridgePolicy,
        correlationId,
        clinicId: row.clinic_id,
      });
      if (r.ok) {
        await markOutboxSent(pool, row.id);
        const mid = row.payload.mark_reminder_after_send;
        if (typeof mid === "number" && Number.isFinite(mid)) {
          await markReminderSent(pool, mid);
        }
        sent += 1;
        incProductMetric("outbox_drain_sent_total");
      } else {
        await markOutboxFailed(pool, row.id, r.detail);
        failed += 1;
        incProductMetric("outbox_drain_failed_total");
      }
    }
    return NextResponse.json({
      ok: true,
      claimed: batch.length,
      sent,
      failed,
      blocked_policy: blocked,
      correlation_id: correlationId,
    });
  } catch (e) {
    opsLogError("internal/jobs/outbox-drain", e, {});
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
