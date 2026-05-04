import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  try {
    const pool = getPool();
    const doctorsCountSql = `
      SELECT clinic_id, COUNT(*)::int AS doctor_count
      FROM doctors
      WHERE COALESCE(is_active, true) = true
      GROUP BY clinic_id
    `;
    const summary = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE s.status = 'active')::int AS active_clinics,
         COUNT(*) FILTER (WHERE s.status IN ('trial', 'trial_expiring'))::int AS trial_clinics,
        COUNT(*) FILTER (WHERE s.status IN ('trial_expired', 'suspended'))::int AS locked_clinics,
         COALESCE(SUM(CASE WHEN s.status = 'active'
           THEN s.base_price_usd + (GREATEST(0, COALESCE(d.doctor_count, 0) - s.included_doctors) * s.extra_doctor_price_usd)
           ELSE 0 END), 0)::float8 AS projected_mrr_usd
       FROM clinic_local_subscriptions s
       LEFT JOIN (${doctorsCountSql}) d ON d.clinic_id = s.clinic_id`,
    );

    const payments = await pool.query(
      `SELECT
         COALESCE(SUM(amount_usd), 0)::float8 AS approved_total_usd,
         COUNT(*)::int AS approved_payments,
         COALESCE(SUM(amount_usd) FILTER (WHERE status = 'pending'), 0)::float8 AS pending_total_usd,
         COALESCE(SUM(amount_usd) FILTER (WHERE status = 'pending' AND requested_at < NOW() - interval '3 days'), 0)::float8 AS overdue_total_usd,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_requests,
         COUNT(*) FILTER (WHERE status = 'pending' AND requested_at < NOW() - interval '3 days')::int AS overdue_requests
       FROM clinic_payment_requests
       WHERE requested_at >= date_trunc('month', NOW())`,
    );

    const clinicRows = await pool.query(
      `SELECT s.clinic_id, c.name AS clinic_name, s.status, s.next_renewal_at,
              s.base_price_usd::float8 AS base_price_usd, s.included_doctors, s.extra_doctor_price_usd::float8 AS extra_doctor_price_usd,
              COALESCE(d.doctor_count, 0)::int AS doctor_count,
              (s.base_price_usd + (GREATEST(0, COALESCE(d.doctor_count, 0) - s.included_doctors) * s.extra_doctor_price_usd))::float8 AS estimated_monthly_total_usd
       FROM clinic_local_subscriptions s
       JOIN clinics c ON c.id = s.clinic_id
       LEFT JOIN (${doctorsCountSql}) d ON d.clinic_id = s.clinic_id
       ORDER BY estimated_monthly_total_usd DESC, c.name ASC
       LIMIT 200`,
    );

    const reminderRuns = await pool.query(
      `SELECT id, trigger_source, status, sent_count, failed_count, skipped_count, error_text, started_at, ended_at
       FROM billing_reminder_runs
       ORDER BY started_at DESC
       LIMIT 20`,
    );

    return NextResponse.json({
      ok: true,
      summary: { ...(summary.rows[0] || {}), ...(payments.rows[0] || {}) },
      clinics: clinicRows.rows,
      reminder_runs: reminderRuns.rows,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
