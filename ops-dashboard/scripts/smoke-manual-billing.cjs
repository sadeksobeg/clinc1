/**
 * Manual billing smoke test:
 * Trial -> Submit Payment -> Admin Approve -> Active -> Renewal Reminder -> Suspend
 *
 * Usage:
 *   cd ops-dashboard
 *   node scripts/smoke-manual-billing.cjs
 */
require("./load-ops-env.cjs");
const { Client } = require("pg");

const baseUrl = (process.env.OPS_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const token = (process.env.SCHEDULING_SERVICE_TOKEN || "").trim();
const clinicId = Number(process.env.SMOKE_CLINIC_ID || "1");
const databaseUrl = (process.env.DATABASE_URL || "").trim();

if (!token) {
  console.error("Missing SCHEDULING_SERVICE_TOKEN");
  process.exit(1);
}
if (!databaseUrl) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = body.error || `HTTP_${res.status}`;
    throw new Error(`${path} failed: ${err}`);
  }
  return body;
}

async function withDb(run) {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function seedTrialState() {
  return withDb(async (db) => {
    await db.query(
      `UPDATE clinics
          SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
        WHERE id = $1`,
      [clinicId, JSON.stringify({ billing_phone: "+963900000001" })],
    );

    await db.query(
      `INSERT INTO clinic_local_subscriptions (
         clinic_id, status, trial_started_at, trial_ends_at, active_started_at,
         next_renewal_at, suspended_at, suspension_reason, updated_at
       ) VALUES (
         $1, 'trial', NOW() - interval '2 days', NOW() + interval '1 day', NULL,
         NULL, NULL, NULL, NOW()
       )
       ON CONFLICT (clinic_id) DO UPDATE
       SET status = 'trial',
           trial_started_at = NOW() - interval '2 days',
           trial_ends_at = NOW() + interval '1 day',
           active_started_at = NULL,
           next_renewal_at = NULL,
           suspended_at = NULL,
           suspension_reason = NULL,
           updated_at = NOW()`,
      [clinicId],
    );
  });
}

async function latestPendingRequestId() {
  const list = await api(`/api/internal/billing/admin/requests?status=pending&limit=100`);
  const row = (list.rows || []).find((r) => Number(r.clinic_id) === clinicId);
  if (!row) throw new Error("No pending request found for clinic");
  return Number(row.id);
}

async function setRenewalWindow(hoursFromNow) {
  return withDb(async (db) => {
    await db.query(
      `UPDATE clinic_local_subscriptions
          SET status = 'active',
              next_renewal_at = NOW() + ($2 || ' hours')::interval,
              suspended_at = NULL,
              suspension_reason = NULL,
              updated_at = NOW()
        WHERE clinic_id = $1`,
      [clinicId, String(hoursFromNow)],
    );
  });
}

async function latestReminderKind() {
  return withDb(async (db) => {
    const q = await db.query(
      `SELECT kind, send_ok, created_at
         FROM billing_notification_log
        WHERE clinic_id = $1
        ORDER BY id DESC
        LIMIT 1`,
      [clinicId],
    );
    return q.rows[0] || null;
  });
}

async function run() {
  const result = {
    clinic_id: clinicId,
    trial_status: null,
    created_request_id: null,
    approved_request_id: null,
    active_status: null,
    reminder_run: null,
    last_reminder_kind: null,
    suspend_run: null,
    suspended_status: null,
  };

  await seedTrialState();
  const trialSnap = await api(`/api/internal/billing/clinics/${clinicId}`);
  result.trial_status = trialSnap.snapshot?.status || null;

  const req = await api(`/api/internal/billing/clinics/${clinicId}`, {
    method: "POST",
    body: JSON.stringify({
      payment_method: "shamcash",
      amount_usd: 150,
      receipt_url: "https://example.com/receipt-smoke.png",
      reference_code: `SMOKE-${Date.now()}`,
      note: "smoke-test payment request",
      requested_by: "smoke_test_runner",
      request_type: "activation",
    }),
  });
  result.created_request_id = Number(req.request?.id || 0) || null;

  const pendingId = await latestPendingRequestId();
  await api(`/api/internal/billing/admin/requests/${pendingId}/review`, {
    method: "POST",
    body: JSON.stringify({
      decision: "approve",
      reviewer: "smoke_test_runner",
      review_note: "Approved by automated smoke test",
    }),
  });
  result.approved_request_id = pendingId;

  const activeSnap = await api(`/api/internal/billing/clinics/${clinicId}`);
  result.active_status = activeSnap.snapshot?.status || null;

  await setRenewalWindow(24);
  const reminderRun = await api(`/api/internal/billing/reminders/run`, { method: "POST" });
  result.reminder_run = {
    sent: Number(reminderRun.sent || 0),
    failed: Number(reminderRun.failed || 0),
    skipped: Number(reminderRun.skipped || 0),
  };
  const kind = await latestReminderKind();
  result.last_reminder_kind = kind ? { kind: kind.kind, send_ok: kind.send_ok, created_at: kind.created_at } : null;

  await setRenewalWindow(-1);
  const suspendRun = await api(`/api/internal/billing/reminders/run`, { method: "POST" });
  result.suspend_run = {
    sent: Number(suspendRun.sent || 0),
    failed: Number(suspendRun.failed || 0),
    skipped: Number(suspendRun.skipped || 0),
  };
  const suspendedSnap = await api(`/api/internal/billing/clinics/${clinicId}`);
  result.suspended_status = suspendedSnap.snapshot?.status || null;

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

run().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message || String(e) }, null, 2));
  process.exit(1);
});
