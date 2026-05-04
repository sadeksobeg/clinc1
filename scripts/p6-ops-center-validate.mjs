/**
 * Validates Ops Center flows against a running stack (same paths as the UI):
 * - PANIC / emergency_mode ON
 * - emergency/status includes latest_snapshot after activation
 * - emergency_mode OFF
 * - Four incident drill simulations with expected PASS/FAIL
 *
 * Env (defaults match p5 smoke):
 *   P6_BASE_WEB — default http://127.0.0.1:3000
 */
const baseWeb = process.env.P6_BASE_WEB || process.env.P5_BASE_WEB || "http://127.0.0.1:3000";

function extractCookie(setCookie) {
  if (!setCookie) return "";
  const first = setCookie.split(",")[0];
  return first.split(";")[0];
}

async function request(url, init = {}) {
  return fetch(url, { redirect: "manual", ...init });
}

async function login() {
  const creds = [
    { email: "ops@local.test", password: "Admin12345!" },
    { email: "admin@example.com", password: "Admin12345!" },
  ];
  for (const c of creds) {
    const r = await request(`${baseWeb}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(c),
    });
    if (!r.ok) continue;
    const cookie = extractCookie(r.headers.get("set-cookie"));
    if (cookie.includes("ops_session=")) return cookie;
  }
  return "";
}

function assert(name, cond, detail) {
  const pass = Boolean(cond);
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}: ${detail}`);
  if (!pass) throw new Error(`Assertion failed: ${name}`);
}

async function main() {
  const cookie = await login();
  assert("Login", cookie.length > 0, "session cookie (ops_session) required");

  const health0 = await request(`${baseWeb}/api/ops/system/health`, { headers: { cookie } });
  const health0Json = await health0.json().catch(() => ({}));
  assert(
    "GET system/health includes P7 whatsapp_safety",
    health0.ok && health0Json?.health?.whatsapp_safety?.circuit_threshold > 0,
    `status=${health0.status} keys=${Object.keys(health0Json?.health || {}).join(",")}`,
  );

  const status0 = await request(`${baseWeb}/api/ops/system/emergency/status`, { headers: { cookie } });
  const j0 = await status0.json().catch(() => ({}));
  assert("GET emergency/status (before)", status0.ok && j0.ok === true, `status=${status0.status}`);

  const panic = await request(`${baseWeb}/api/ops/system/emergency/toggle`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      mode: "emergency_mode",
      enabled: true,
      reason: "p6 validate panic button and auto-snapshot",
    }),
  });
  const panicJson = await panic.json().catch(() => ({}));
  assert(
    "PANIC (POST emergency/toggle ON)",
    panic.ok && panicJson?.emergency?.emergency_mode === true,
    `http=${panic.status} emergency_mode=${String(panicJson?.emergency?.emergency_mode)}`,
  );

  const status1 = await request(`${baseWeb}/api/ops/system/emergency/status`, { headers: { cookie } });
  const j1 = await status1.json().catch(() => ({}));
  const snap = j1?.emergency?.latest_snapshot;
  assert(
    "Auto-snapshot present after activation",
    status1.ok &&
      j1.ok === true &&
      snap &&
      (snap.id !== undefined && snap.id !== null) &&
      String(snap.reason || "").length > 0,
    `snapshot_id=${snap?.id} reason_len=${String(snap?.reason || "").length}`,
  );

  const off = await request(`${baseWeb}/api/ops/system/emergency/toggle`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      mode: "emergency_mode",
      enabled: false,
      reason: "p6 validate exit emergency after snapshot check",
    }),
  });
  const offJson = await off.json().catch(() => ({}));
  assert(
    "Exit emergency_mode",
    off.ok && offJson?.emergency?.emergency_mode === false,
    `http=${off.status} emergency_mode=${String(offJson?.emergency?.emergency_mode)}`,
  );

  const drills = [
    { type: "db_degraded", expect: "failed" },
    { type: "whatsapp_failure_spike", expect: "passed" },
    { type: "billing_failure_spike", expect: "failed" },
    { type: "dead_jobs_spike", expect: "failed" },
    { type: "load_burst", expect: "failed" },
  ];

  for (const d of drills) {
    const r = await request(`${baseWeb}/api/ops/system/simulation/run`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        scenario_name: `p6_drill_${d.type}`,
        drill_type: d.type,
        clinics: 50,
        conversations_per_day: 600,
      }),
    });
    const j = await r.json().catch(() => ({}));
    const checks = j.checks && typeof j.checks === "object" ? j.checks : {};
    const checksStr = Object.entries(checks)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    assert(
      `Drill ${d.type} -> ${d.expect}`,
      r.ok && j.status === d.expect && j.ok === true,
      `http=${r.status} status=${j.status} expected=${d.expect} checks=[${checksStr}]`,
    );
  }

  console.log("\nP6 Ops Center validation: all checks passed.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
