/**
 * Concurrent hammer on process-inbound + interpret + slots (Bearer SCHEDULING_SERVICE_TOKEN).
 * Optional SQL: with DATABASE_URL, reports duplicate inbound rows by dedupe_hash (set LOADTEST_RUN_SQL=0 to skip).
 *
 *   $env:SCHEDULING_SERVICE_TOKEN="..."; $env:OPS_BASE_URL="http://127.0.0.1:3001"; node scripts/load-test.cjs
 */
const { performance } = require("node:perf_hooks");

const BASE = (process.env.OPS_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const TOKEN = (process.env.SCHEDULING_SERVICE_TOKEN || "").trim();
const CONCURRENCY = Math.max(1, Number(process.env.LOADTEST_CONCURRENCY || 20));
const ROUNDS = Math.max(1, Number(process.env.LOADTEST_ROUNDS || 5));
const CLINIC_ID = Number(process.env.LOADTEST_CLINIC_ID || 1);

if (!TOKEN) {
  console.error("SCHEDULING_SERVICE_TOKEN is required");
  process.exit(1);
}

async function post(path, body) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "X-Correlation-Id": `load-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const ms = performance.now() - t0;
  return { ok: res.ok, status: res.status, ms, text: text.slice(0, 400) };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function runSqlDedupeReport() {
  const dbUrl = (process.env.DATABASE_URL || "").trim();
  if (!dbUrl || process.env.LOADTEST_RUN_SQL === "0") {
    return {
      skipped: true,
      reason: !dbUrl ? "DATABASE_URL unset" : "LOADTEST_RUN_SQL=0",
    };
  }
  const { Client } = require("pg");
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  try {
    const dup = await c.query(
      `SELECT dedupe_hash, COUNT(*)::int AS c
       FROM messages
       WHERE direction = 'inbound'
         AND created_at > NOW() - INTERVAL '2 hours'
         AND text LIKE 'load %'
         AND dedupe_hash IS NOT NULL
       GROUP BY dedupe_hash
       HAVING COUNT(*) > 1
       LIMIT 50`,
    );
    const idem = await c.query(
      `SELECT idempotency_key, COUNT(*)::int AS c
       FROM appointments
       WHERE deleted_at IS NULL
         AND created_at > NOW() - INTERVAL '2 hours'
         AND idempotency_key IS NOT NULL
         AND idempotency_key LIKE 'slot_confirm:%'
       GROUP BY idempotency_key
       HAVING COUNT(*) > 1
       LIMIT 50`,
    );
    return {
      skipped: false,
      duplicate_dedupe_hash_groups: dup.rows.length,
      duplicate_dedupe_samples: dup.rows.slice(0, 8),
      duplicate_appointment_idempotency_groups: idem.rows.length,
      duplicate_idempotency_samples: idem.rows.slice(0, 8),
    };
  } finally {
    await c.end();
  }
}

async function main() {
  const latencies = [];
  let errors = 0;
  const worker = async (wid) => {
    for (let r = 0; r < ROUNDS; r++) {
      const from = `+1555000${String(wid).padStart(4, "0")}${String(r).padStart(3, "0")}`;
      const a = await post("/api/internal/conversations/process-inbound", {
        clinic_id: CLINIC_ID,
        from,
        text: `load ${wid} round ${r}`,
        messageId: `load-${wid}-${r}-${Date.now()}`,
        execute_send: false,
        send_urgent_alert: false,
      });
      latencies.push(a.ms);
      if (!a.ok) errors += 1;
      const b = await post("/api/internal/scheduling/interpret", { text: "أريد موعد غداً" });
      latencies.push(b.ms);
      if (!b.ok) errors += 1;
      const c = await post("/api/internal/scheduling/slots", { clinic_id: CLINIC_ID, limit: 3 });
      latencies.push(c.ms);
      if (!c.ok) errors += 1;
    }
  };
  const t0 = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  const totalMs = performance.now() - t0;
  latencies.sort((x, y) => x - y);

  const sql_checks = await runSqlDedupeReport();

  const report = {
    concurrency: CONCURRENCY,
    rounds_per_worker: ROUNDS,
    total_requests: CONCURRENCY * ROUNDS * 3,
    wall_ms: Math.round(totalMs),
    errors,
    latency_ms: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      max: Math.round(latencies[latencies.length - 1] || 0),
    },
    sql_checks,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!sql_checks.skipped && (sql_checks.duplicate_dedupe_hash_groups > 0 || sql_checks.duplicate_appointment_idempotency_groups > 0)) {
    console.error("SQL checks found possible duplicates — investigate.");
    process.exit(3);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
