/**
 * Day-2 pilot gate: checks deep-health + validates manual pilot confirmations.
 *
 * Usage (PowerShell):
 *   $env:OPS_BASE_URL="http://127.0.0.1:3001"
 *   $env:SCHEDULING_SERVICE_TOKEN="..."
 *   $env:PILOT_CLINIC_ID="1"
 *   $env:PILOT_CONFIRMED_INBOUND_BOOKING="1"
 *   $env:PILOT_CONFIRMED_REMINDER="1"
 *   $env:PILOT_CONFIRMED_BILLING_ACTION="1"
 *   node scripts/pilot-clinic-day2.cjs
 */
const base = (process.env.OPS_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const token = (process.env.SCHEDULING_SERVICE_TOKEN || process.env.HEALTH_DEEP_TOKEN || "").trim();
const clinicId = Number(process.env.PILOT_CLINIC_ID || 0);

function boolFlag(name) {
  return process.env[name] === "1";
}

async function readJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`non_json_response ${url} ${res.status}`);
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const issues = [];
  if (!token) issues.push("missing_service_token");
  if (!Number.isFinite(clinicId) || clinicId <= 0) issues.push("missing_pilot_clinic_id");
  if (issues.length) {
    console.error(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${token}` };
  const deep = await readJson(`${base}/api/system/health/deep`, { headers, signal: AbortSignal.timeout(15000) });
  if (!deep.ok) issues.push(`deep_health_http_${deep.status}`);
  const deepStatus = String(deep.body?.status || "");
  if (deepStatus !== "ok" && deepStatus !== "degraded") issues.push(`deep_status_${deepStatus || "unknown"}`);
  if (Number(deep.body?.dead_letter_events_5m || 0) > 0) issues.push("dead_letter_events_detected");

  const trialSnap = await readJson(`${base}/api/internal/billing/clinics/${clinicId}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!trialSnap.ok) issues.push(`billing_snapshot_http_${trialSnap.status}`);

  if (!boolFlag("PILOT_CONFIRMED_INBOUND_BOOKING")) issues.push("manual_confirm_missing_inbound_booking");
  if (!boolFlag("PILOT_CONFIRMED_REMINDER")) issues.push("manual_confirm_missing_reminder");
  if (!boolFlag("PILOT_CONFIRMED_BILLING_ACTION")) issues.push("manual_confirm_missing_billing_action");

  const out = {
    ok: issues.length === 0,
    issues,
    deep_status: deep.body?.status,
    pilot_clinic_id: clinicId,
    billing_status: trialSnap.body?.snapshot?.status || "unknown",
  };
  console.log(JSON.stringify(out, null, 2));
  if (issues.length) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e?.message || String(e) }, null, 2));
  process.exit(1);
});
