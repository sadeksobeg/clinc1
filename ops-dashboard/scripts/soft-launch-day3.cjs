/**
 * Day-3 soft-launch gate. Requires technical gates + manual support readiness.
 *
 * Usage:
 *   $env:OPS_BASE_URL="http://127.0.0.1:3001"
 *   $env:SCHEDULING_SERVICE_TOKEN="..."
 *   $env:SOFT_LAUNCH_SUPPORT_ONCALL="1"
 *   $env:SOFT_LAUNCH_PILOT_STABLE="1"
 *   $env:SOFT_LAUNCH_TRIAL_E2E_OK="1"
 *   node scripts/soft-launch-day3.cjs
 */
const base = (process.env.OPS_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const token = (process.env.SCHEDULING_SERVICE_TOKEN || process.env.HEALTH_DEEP_TOKEN || "").trim();

function boolFlag(name) {
  return process.env[name] === "1";
}

async function getDeep() {
  const res = await fetch(`${base}/api/system/health/deep`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const txt = await res.text();
  let body = {};
  try {
    body = JSON.parse(txt);
  } catch {
    return { ok: false, status: res.status, body: { parse_error: true } };
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const issues = [];
  if (!token) issues.push("missing_service_token");

  const deep = await getDeep();
  if (!deep.ok) issues.push(`deep_health_http_${deep.status}`);
  const status = String(deep.body?.status || "");
  if (status !== "ok") issues.push(`deep_status_${status || "unknown"}`);
  if (Number(deep.body?.dead_letter_events_5m || 0) > 0) issues.push("dead_letter_events_detected");

  if (!boolFlag("SOFT_LAUNCH_TRIAL_E2E_OK")) issues.push("manual_confirm_missing_trial_e2e");
  if (!boolFlag("SOFT_LAUNCH_PILOT_STABLE")) issues.push("manual_confirm_missing_pilot_stability");
  if (!boolFlag("SOFT_LAUNCH_SUPPORT_ONCALL")) issues.push("manual_confirm_missing_support_oncall");

  const out = {
    ok: issues.length === 0,
    issues,
    deep_status: deep.body?.status,
    stream_lag_ms: deep.body?.stream_lag_ms ?? null,
    pending_count: deep.body?.pending_count ?? null,
  };
  console.log(JSON.stringify(out, null, 2));
  if (issues.length) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e?.message || String(e) }, null, 2));
  process.exit(1);
});
