require("./load-ops-env.cjs");

async function main() {
  const base = (process.env.OPS_DASHBOARD_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
  const token = (process.env.SCHEDULING_SERVICE_TOKEN || "").trim();
  if (!token) {
    throw new Error("SCHEDULING_SERVICE_TOKEN is required");
  }
  const res = await fetch(`${base}/api/internal/billing/reminders/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trigger_source: "cron_worker" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`billing_reminders_failed: ${data.error || res.statusText}`);
  }
  console.log(JSON.stringify({ ok: true, run_id: data.run_id, sent: data.sent, failed: data.failed, skipped: data.skipped }));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
