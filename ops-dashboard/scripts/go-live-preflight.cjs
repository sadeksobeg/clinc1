/**
 * Calls GET /api/system/health/deep and enforces go-live thresholds (configurable).
 *
 *   $env:OPS_BASE_URL="http://127.0.0.1:3001"
 *   $env:SCHEDULING_SERVICE_TOKEN="..."   # or HEALTH_DEEP_TOKEN
 *   node scripts/go-live-preflight.cjs
 *
 * Optional:
 *   GO_LIVE_ALLOW_DEGRADED=1   — allow status "degraded" (not recommended for first prod cut)
 *   GO_LIVE_MAX_LAG_MS=60000   — fail if lag_ms is set and exceeds this (idle streams can look "stale")
 */
const base = (process.env.OPS_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const token = (process.env.SCHEDULING_SERVICE_TOKEN || process.env.HEALTH_DEEP_TOKEN || "").trim();
const allowDegraded = process.env.GO_LIVE_ALLOW_DEGRADED === "1";
const maxLag = process.env.GO_LIVE_MAX_LAG_MS ? Number(process.env.GO_LIVE_MAX_LAG_MS) : null;

async function main() {
  if (!token) {
    console.error("Set SCHEDULING_SERVICE_TOKEN or HEALTH_DEEP_TOKEN");
    process.exit(1);
  }
  const res = await fetch(`${base}/api/system/health/deep`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.error("Non-JSON response", res.status, text.slice(0, 500));
    process.exit(1);
  }

  const issues = [];
  if (!res.ok) issues.push(`http_${res.status}`);
  const st = body.status;
  if (st === "down") issues.push("status_down");
  if (st === "degraded" && !allowDegraded) issues.push("status_degraded");

  const dl = body.dead_letter_events_5m;
  if (typeof dl === "number" && dl > 0) issues.push(`dead_letter_events_5m=${dl}`);
  if (body.dead_letter_spike === true) issues.push("dead_letter_spike");

  if (maxLag != null && Number.isFinite(maxLag) && body.lag_ms != null && body.lag_ms > maxLag) {
    issues.push(`lag_ms=${body.lag_ms}>${maxLag}`);
  }

  const out = { ok: issues.length === 0, issues, report: body };
  console.log(JSON.stringify(out, null, 2));
  if (issues.length) process.exit(1);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
