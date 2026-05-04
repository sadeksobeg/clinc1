/**
 * Root E2E go-live smoke: server checks → migration check → billing smoke → JSON report.
 *
 *   node scripts/e2e-go-live-smoke.cjs
 *   npm run e2e:go-live-smoke
 *
 * Env (merged from repo `.env` then `ops-dashboard/.env.local` when unset):
 *   OPS_BASE_URL          default http://127.0.0.1:3001
 *   DATABASE_URL          Postgres (same as ops-dashboard)
 *   SCHEDULING_SERVICE_TOKEN
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const opsDir = path.join(repoRoot, "ops-dashboard");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadEnv() {
  const merged = {
    ...parseEnvFile(path.join(repoRoot, ".env")),
    ...parseEnvFile(path.join(opsDir, ".env")),
    ...parseEnvFile(path.join(opsDir, ".env.local")),
  };
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function maskUrl(u) {
  if (!u || typeof u !== "string") return null;
  return u.replace(/:[^:@/]+@/, ":****@");
}

async function serverChecks(baseUrl, token) {
  const out = {
    base_url: baseUrl,
    login_http: null,
    login_ok: false,
    metrics_http: null,
    metrics_ok: false,
    error: null,
  };
  try {
    const loginRes = await fetch(`${baseUrl}/login`, { method: "GET", signal: AbortSignal.timeout(10_000) });
    out.login_http = loginRes.status;
    out.login_ok = loginRes.ok;
  } catch (e) {
    out.error = `login_fetch: ${e.message || String(e)}`;
    return out;
  }
  try {
    const mRes = await fetch(`${baseUrl}/api/internal/metrics/product`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    out.metrics_http = mRes.status;
    out.metrics_ok = mRes.ok;
    if (!mRes.ok) out.error = out.error || `metrics_http_${mRes.status}`;
  } catch (e) {
    out.error = out.error || `metrics_fetch: ${e.message || String(e)}`;
  }
  return out;
}

function requirePgClient() {
  const pgMod = path.join(opsDir, "node_modules", "pg");
  if (!fs.existsSync(path.join(pgMod, "package.json"))) {
    throw new Error("pg not found under ops-dashboard/node_modules; run npm install in ops-dashboard");
  }
  // eslint-disable-next-line import/no-dynamic-require
  return require(pgMod).Client;
}

async function migrationCheck(databaseUrl) {
  const required = [
    "clinic_local_subscriptions",
    "clinic_payment_requests",
    "billing_notification_log",
  ];
  const Client = requirePgClient();
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [required],
    );
    const found = new Set(rows.map((r) => r.table_name));
    const missing = required.filter((t) => !found.has(t));
    return {
      ok: missing.length === 0,
      missing_tables: missing,
      found_tables: [...found].sort(),
    };
  } finally {
    await client.end();
  }
}

function runBillingSmoke() {
  const script = path.join(opsDir, "scripts", "smoke-manual-billing.cjs");
  if (!fs.existsSync(script)) {
    return { ok: false, error: "missing ops-dashboard/scripts/smoke-manual-billing.cjs", exit_code: -1 };
  }
  const r = spawnSync(process.execPath, [script], {
    cwd: opsDir,
    encoding: "utf8",
    env: process.env,
    timeout: 120_000,
    maxBuffer: 5 * 1024 * 1024,
  });
  const stdout = (r.stdout || "").trim();
  const stderr = (r.stderr || "").trim();
  if (r.status !== 0) {
    return {
      ok: false,
      exit_code: r.status,
      error: stderr || stdout || "billing smoke failed",
      signal: r.signal || null,
    };
  }
  try {
    const parsed = JSON.parse(stdout);
    return { ok: Boolean(parsed.ok), result: parsed, exit_code: r.status };
  } catch {
    return {
      ok: false,
      exit_code: r.status,
      error: "could not parse billing smoke JSON from stdout",
      stdout_preview: stdout.slice(0, 500),
    };
  }
}

async function main() {
  loadEnv();
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const baseUrl = (process.env.OPS_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
  const token = (process.env.SCHEDULING_SERVICE_TOKEN || "").trim();
  const databaseUrl = (process.env.DATABASE_URL || "").trim();

  const report = {
    ok: false,
    report_version: 1,
    started_at: startedAt,
    finished_at: null,
    duration_ms: null,
    server: null,
    migrations: null,
    billing_smoke: null,
    overall_pass: false,
    notes: [
      "Server: login page must respond; metrics route validates SCHEDULING_SERVICE_TOKEN.",
      "Migrations: expects manual billing tables from 013_manual_billing_local.sql.",
      "Billing smoke: mutates clinic_id=1 subscription state for demo — use disposable DB for CI.",
    ],
  };

  const failures = [];

  report.server = await serverChecks(baseUrl, token);
  if (!report.server.login_ok) failures.push("server_unreachable_or_login");
  if (!token) failures.push("missing_scheduling_token");
  else if (report.server.login_ok && !report.server.metrics_ok) failures.push("server_metrics_auth");

  if (!databaseUrl) {
    report.migrations = { ok: false, error: "DATABASE_URL unset" };
    failures.push("migrations_no_database_url");
  } else {
    try {
      report.migrations = await migrationCheck(databaseUrl);
      if (!report.migrations.ok) failures.push("migrations_missing_tables");
    } catch (e) {
      report.migrations = { ok: false, error: e.message || String(e) };
      failures.push("migrations_db_error");
    }
  }

  if (!databaseUrl || !token) {
    report.billing_smoke = { ok: false, skipped: true, reason: "DATABASE_URL or SCHEDULING_SERVICE_TOKEN missing" };
    failures.push("billing_skipped");
  } else if (!report.server?.login_ok) {
    report.billing_smoke = { ok: false, skipped: true, reason: "ops-dashboard not reachable" };
    failures.push("billing_skipped");
  } else if (!report.server?.metrics_ok) {
    report.billing_smoke = { ok: false, skipped: true, reason: "metrics auth failed — fix token or ops-dashboard" };
    failures.push("billing_skipped");
  } else if (report.migrations && !report.migrations.ok) {
    report.billing_smoke = { ok: false, skipped: true, reason: "manual billing tables missing — run npm run db:apply-scheduling in ops-dashboard" };
    failures.push("billing_skipped");
  } else {
    report.billing_smoke = runBillingSmoke();
    if (!report.billing_smoke.ok) failures.push("billing_smoke");
  }

  report.finished_at = new Date().toISOString();
  report.duration_ms = Date.now() - t0;
  report.overall_pass =
    report.server?.login_ok &&
    Boolean(token && report.server?.metrics_ok) &&
    report.migrations?.ok === true &&
    report.billing_smoke?.ok === true;
  report.ok = report.overall_pass;
  report.failures = [...new Set(failures)];
  report.env_hint = {
    ops_base_url: baseUrl,
    database_url: maskUrl(databaseUrl),
    scheduling_token_set: Boolean(token),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.overall_pass ? 0 : 1);
}

main().catch((e) => {
  const report = {
    ok: false,
    report_version: 1,
    error: e.message || String(e),
    finished_at: new Date().toISOString(),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(1);
});
