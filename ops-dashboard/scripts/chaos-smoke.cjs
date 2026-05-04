/**
 * Lightweight dependency expectations (no Docker stop automation).
 * - With REDIS_URL unset: ops should still answer (Redis publish is best-effort).
 * - Bridge /ready: expect 200 or explicit failure text when bridge is down.
 *
 *   $env:SCHEDULING_SERVICE_TOKEN="..."; node scripts/chaos-smoke.cjs
 */
const BASE = (process.env.OPS_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const TOKEN = (process.env.SCHEDULING_SERVICE_TOKEN || "").trim();
const BRIDGE = (process.env.BRIDGE_INTERNAL_URL || "http://127.0.0.1:3100").replace(/\/$/, "");

async function main() {
  const out = { redis_url_configured: Boolean((process.env.REDIS_URL || "").trim()), checks: [] };

  if (TOKEN) {
    try {
      const r = await fetch(`${BASE}/api/internal/metrics/product`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      out.checks.push({ name: "metrics_product", ok: r.ok, status: r.status });
    } catch (e) {
      out.checks.push({ name: "metrics_product", ok: false, error: String(e?.message || e) });
    }
  } else {
    out.checks.push({ name: "metrics_product", skipped: true, reason: "no SCHEDULING_SERVICE_TOKEN" });
  }

  try {
    const br = await fetch(`${BRIDGE}/ready`, { signal: AbortSignal.timeout(3000) });
    out.checks.push({
      name: "bridge_ready",
      ok: br.ok,
      status: br.status,
      note: "Stop bridge container/process to validate degraded behavior in deep health / scheduling",
    });
  } catch (e) {
    out.checks.push({
      name: "bridge_ready",
      ok: false,
      error: String(e?.message || e),
      note: "Expected when bridge is intentionally down",
    });
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
