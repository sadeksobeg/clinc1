import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { getDefaultMessagingAdapter } from "@/lib/messaging/WhatsAppWebAdapter";
import { incProductMetric } from "@/lib/observability/productMetrics";

type ReminderRow = {
  clinic_id: number;
  subscription_id: number;
  status: "trial" | "trial_expiring" | "trial_expired" | "active" | "grace" | "past_due" | "suspended" | "cancelled";
  trial_ends_at: string | null;
  next_renewal_at: string | null;
  billing_phone: string | null;
};

function buildReminderMessage(row: ReminderRow): { kind: string; text: string } | null {
  const now = Date.now();
  if ((row.status === "trial" || row.status === "trial_expiring") && row.trial_ends_at) {
    const trialMs = new Date(row.trial_ends_at).getTime() - now;
    if (trialMs > 0 && trialMs <= 24 * 60 * 60 * 1000) {
      return {
        kind: "trial_expiring_24h",
        text: "تنبيه: تنتهي التجربة المجانية خلال أقل من 24 ساعة. لتجنب التوقف، افتح صفحة الفوترة وارفع طلب دفع الآن.",
      };
    }
    if (trialMs > 24 * 60 * 60 * 1000 && trialMs <= 48 * 60 * 60 * 1000) {
      return {
        kind: "trial_expiring_48h",
        text: "تذكير: تبقى أقل من 48 ساعة على انتهاء التجربة. جهّز طلب الدفع الآن لتفادي توقف الأتمتة.",
      };
    }
  }
  if ((row.status === "active" || row.status === "grace" || row.status === "past_due" || row.status === "suspended") && row.next_renewal_at) {
    const dueMs = new Date(row.next_renewal_at).getTime() - now;
    if (dueMs > 0 && dueMs <= 3 * 24 * 60 * 60 * 1000) {
      return {
        kind: "renewal_due_3d",
        text: "تذكير: اشتراك العيادة على وشك التجديد خلال 3 أيام. يرجى إرسال إثبات الدفع لتجنب التعليق.",
      };
    }
    if (dueMs <= 0) {
      return {
        kind: "renewal_overdue",
        text: "تنبيه: الاشتراك متأخر عن التجديد. يرجى إرسال إثبات الدفع لتجنب التعليق.",
      };
    }
  }
  return null;
}

export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  let triggerSource = "manual";
  try {
    const body = (await req.json().catch(() => ({}))) as { trigger_source?: string };
    if (typeof body.trigger_source === "string" && body.trigger_source.trim()) {
      triggerSource = body.trigger_source.trim().slice(0, 40);
    }
  } catch {
    // optional body only
  }

  const pool = getPool();
  incProductMetric("billing_reminders_run_total");
  const runR = await pool.query<{ id: number }>(
    `INSERT INTO billing_reminder_runs (trigger_source, status, started_at)
     VALUES ($1, 'running', NOW())
     RETURNING id`,
    [triggerSource],
  );
  const runId = Number(runR.rows[0]?.id || 0);

  try {
    await pool.query(
      `UPDATE clinic_local_subscriptions
          SET status = 'grace',
              suspended_at = NULL,
              suspension_reason = COALESCE(suspension_reason, 'renewal_overdue'),
              updated_at = NOW()
        WHERE status = 'active'
          AND next_renewal_at IS NOT NULL
          AND next_renewal_at <= NOW()`,
    );
    await pool.query(
      `UPDATE clinic_local_subscriptions
          SET status = 'trial_expired',
              suspension_reason = COALESCE(suspension_reason, 'trial_expired'),
              suspended_at = COALESCE(suspended_at, NOW()),
              updated_at = NOW()
        WHERE status IN ('trial', 'trial_expiring')
          AND trial_ends_at IS NOT NULL
          AND trial_ends_at <= NOW()`,
    );
    await pool.query(
      `UPDATE clinic_local_subscriptions
          SET status = 'past_due',
              updated_at = NOW()
        WHERE status = 'grace'
          AND next_renewal_at IS NOT NULL
          AND next_renewal_at <= NOW() - interval '3 days'`,
    );
    await pool.query(
      `UPDATE clinic_local_subscriptions
          SET status = 'suspended',
              suspended_at = COALESCE(suspended_at, NOW()),
              updated_at = NOW()
        WHERE status = 'past_due'
          AND next_renewal_at IS NOT NULL
          AND next_renewal_at <= NOW() - interval '7 days'`,
    );

    const due = await pool.query<ReminderRow>(
      `SELECT s.clinic_id, s.id AS subscription_id, s.status, s.trial_ends_at, s.next_renewal_at,
              COALESCE(c.metadata->>'billing_phone', c.metadata->>'owner_phone', c.metadata->>'phone') AS billing_phone
         FROM clinic_local_subscriptions s
         JOIN clinics c ON c.id = s.clinic_id
        WHERE s.status IN ('trial', 'trial_expiring', 'active', 'grace', 'past_due', 'suspended')`,
    );

    const messaging = getDefaultMessagingAdapter();
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of due.rows) {
      const reminder = buildReminderMessage(row);
      if (!reminder) continue;
      const to = String(row.billing_phone || "").trim();
      if (!to) {
        skipped += 1;
        continue;
      }
      const send = await messaging.send({
        to,
        text: reminder.text,
        policy: { kind: "staff_alert" },
        clinicId: row.clinic_id,
      });
      if (send.ok) sent += 1;
      else failed += 1;

      await pool.query(
        `INSERT INTO billing_notification_log (
           clinic_id, subscription_id, channel, kind, target, message_text, send_ok, send_error, metadata, created_at
         ) VALUES (
           $1, $2, 'whatsapp', $3, $4, $5, $6, $7, '{}'::jsonb, NOW()
         )`,
        [row.clinic_id, row.subscription_id, reminder.kind, to, reminder.text, send.ok, send.ok ? null : send.detail],
      );
    }

    await pool.query(
      `UPDATE billing_reminder_runs
          SET status = 'completed',
              sent_count = $2,
              failed_count = $3,
              skipped_count = $4,
              ended_at = NOW()
        WHERE id = $1`,
      [runId, sent, failed, skipped],
    );
    incProductMetric("billing_reminders_run_success_total");
    return NextResponse.json({ ok: true, run_id: runId, sent, failed, skipped });
  } catch {
    await pool
      .query(
        `UPDATE billing_reminder_runs
            SET status = 'failed',
                error_text = 'internal_error',
                ended_at = NOW()
          WHERE id = $1`,
        [runId],
      )
      .catch(() => undefined);
    incProductMetric("billing_reminders_run_error_total");
    return NextResponse.json({ ok: false, run_id: runId, error: "internal_error" }, { status: 500 });
  }
}
