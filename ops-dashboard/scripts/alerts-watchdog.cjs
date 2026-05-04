/**
 * P6 Alerts Watchdog
 *
 * Polls internal system endpoints and emits actionable alerts.
 *
 * Usage:
 *   $env:OPS_BASE_URL="http://127.0.0.1:3001"
 *   $env:SCHEDULING_SERVICE_TOKEN="..."
 *   node scripts/alerts-watchdog.cjs
 *
 * Optional:
 *   ALERT_WEBHOOK_URL=https://...
 */
const OPS_BASE_URL = (process.env.OPS_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const TOKEN = (process.env.SCHEDULING_SERVICE_TOKEN || "").trim();
const ALERT_WEBHOOK_URL = (process.env.ALERT_WEBHOOK_URL || "").trim();

const thresholds = {
  db_latency_ms_warn: Number(process.env.ALERT_DB_LATENCY_MS_WARN || 800),
  jobs_dead_warn: Number(process.env.ALERT_JOBS_DEAD_WARN || 1),
  dead_jobs_24h_warn: Number(process.env.ALERT_DEAD_JOBS_24H_WARN || 3),
  webhook_failures_24h_warn: Number(process.env.ALERT_WEBHOOK_FAILURES_24H_WARN || 5),
  reminder_failures_24h_warn: Number(process.env.ALERT_REMINDER_FAILURES_24H_WARN || 3),
  messaging_failures_24h_warn: Number(process.env.ALERT_MESSAGING_FAILURES_24H_WARN || 10),
  outbox_blocked_warn: Number(process.env.ALERT_OUTBOX_BLOCKED_WARN || 20),
  dead_letter_events_warn: Number(process.env.ALERT_DEAD_LETTER_EVENTS_WARN || 5),
  critical_error_occurrences_warn: Number(process.env.ALERT_CRITICAL_ERROR_OCCURRENCES_WARN || 3),
};

async function getJson(path) {
  const res = await fetch(`${OPS_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function buildAlerts(snapshot) {
  const alerts = [];
  const { health = {}, queues = {}, failures = {}, errors = [] } = snapshot;

  if (health.db_ok === false) {
    alerts.push({ id: "system.db.down", severity: "critical", message: "Database health check failed" });
  }
  if (Number(health.db_latency_ms || 0) > thresholds.db_latency_ms_warn) {
    alerts.push({
      id: "system.db.latency.high",
      severity: "high",
      message: `DB latency ${health.db_latency_ms}ms exceeds ${thresholds.db_latency_ms_warn}ms`,
    });
  }
  if (Number(queues.jobs_dead || 0) >= thresholds.jobs_dead_warn) {
    alerts.push({
      id: "jobs.dead.present",
      severity: "critical",
      message: `Dead jobs present (${queues.jobs_dead})`,
    });
  }
  if (Number(failures.dead_jobs_24h || 0) >= thresholds.dead_jobs_24h_warn) {
    alerts.push({
      id: "jobs.dead.spike24h",
      severity: "high",
      message: `Dead jobs in 24h (${failures.dead_jobs_24h}) exceed threshold`,
    });
  }
  if (Number(failures.webhook_failures_24h || 0) >= thresholds.webhook_failures_24h_warn) {
    alerts.push({
      id: "billing.webhook.failures.spike",
      severity: "high",
      message: `Webhook failures 24h=${failures.webhook_failures_24h}`,
    });
  }
  if (Number(failures.reminder_failures_24h || 0) >= thresholds.reminder_failures_24h_warn) {
    alerts.push({
      id: "billing.reminders.failures.spike",
      severity: "medium",
      message: `Reminder failures 24h=${failures.reminder_failures_24h}`,
    });
  }
  if (Number(failures.messaging_failures_24h || 0) >= thresholds.messaging_failures_24h_warn) {
    alerts.push({
      id: "messaging.failures.spike",
      severity: "high",
      message: `Messaging failures 24h=${failures.messaging_failures_24h}`,
    });
  }
  if (Number(queues.outbox_blocked || 0) >= thresholds.outbox_blocked_warn) {
    alerts.push({
      id: "messaging.outbox.blocked",
      severity: "high",
      message: `Blocked outbox=${queues.outbox_blocked}`,
    });
  }
  if (Number(queues.dead_letter_events || 0) >= thresholds.dead_letter_events_warn) {
    alerts.push({
      id: "events.dead_letter.spike",
      severity: "high",
      message: `Dead letter events=${queues.dead_letter_events}`,
    });
  }

  const criticalError = Array.isArray(errors)
    ? errors.find((e) => e?.severity === "critical" && Number(e?.occurrences || 0) >= thresholds.critical_error_occurrences_warn)
    : null;
  if (criticalError) {
    alerts.push({
      id: "errors.critical.occurrence_spike",
      severity: "critical",
      message: `Critical error fingerprint ${String(criticalError.fingerprint || "").slice(0, 12)}... occurrences=${criticalError.occurrences}`,
    });
  }

  return alerts;
}

async function emitWebhook(payload) {
  if (!ALERT_WEBHOOK_URL) return { sent: false };
  const res = await fetch(ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  return { sent: true, status: res.status };
}

async function main() {
  if (!TOKEN) {
    console.error("Set SCHEDULING_SERVICE_TOKEN before running alerts watchdog.");
    process.exit(1);
  }

  const [healthRes, queuesRes, failuresRes, errorsRes] = await Promise.all([
    getJson("/api/internal/system/health"),
    getJson("/api/internal/system/queues"),
    getJson("/api/internal/system/failures"),
    getJson("/api/internal/system/errors?limit=100"),
  ]);

  const snapshot = {
    checked_at: new Date().toISOString(),
    health: healthRes.data?.health || {},
    queues: queuesRes.data?.queues || {},
    failures: failuresRes.data?.failures || {},
    errors: errorsRes.data?.errors || [],
  };

  const alerts = buildAlerts(snapshot);
  const payload = {
    source: "ops_alerts_watchdog",
    checked_at: snapshot.checked_at,
    alerts_count: alerts.length,
    alerts,
    snapshot,
  };

  const webhook = await emitWebhook(payload).catch((e) => ({ sent: true, error: e instanceof Error ? e.message : String(e) }));
  const out = {
    ok: alerts.length === 0,
    alerts_count: alerts.length,
    alerts,
    webhook,
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(alerts.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
