const baseWeb = "http://localhost:3000";

const results = [];

function push(name, pass, details) {
  results.push({ name, pass, details });
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}: ${details}`);
}

async function request(url, init = {}) {
  return fetch(url, { redirect: "manual", ...init });
}

function extractCookie(setCookie) {
  if (!setCookie) return "";
  const first = setCookie.split(",")[0];
  return first.split(";")[0];
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

async function main() {
  const cookie = await login();
  if (!cookie) {
    push("Login for P3 smoke", false, "could_not_login");
    console.log("\nSummary:\n" + JSON.stringify(results, null, 2));
    process.exit(1);
  }
  push("Login for P3 smoke", true, "session_cookie_issued");

  const timelineRes = await request(`${baseWeb}/api/ops/system/timeline?limit=20`, { headers: { cookie } });
  const timelineJson = await timelineRes.json().catch(() => ({}));
  push(
    "Timeline API",
    timelineRes.ok && Array.isArray(timelineJson.timeline),
    `status=${timelineRes.status}, items=${Array.isArray(timelineJson.timeline) ? timelineJson.timeline.length : 0}`,
  );

  const errorsRes = await request(`${baseWeb}/api/ops/system/errors?limit=20`, { headers: { cookie } });
  const errorsJson = await errorsRes.json().catch(() => ({}));
  push(
    "Error aggregation API",
    errorsRes.ok && Array.isArray(errorsJson.errors),
    `status=${errorsRes.status}, items=${Array.isArray(errorsJson.errors) ? errorsJson.errors.length : 0}`,
  );

  const enqueueRes = await request(`${baseWeb}/api/ops/system/jobs`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      job_type: "analytics.trial.rollup.compute",
      queue_key: "default",
      priority: 40,
      payload: { source: "p3_smoke" },
      idempotency_key: `p3-smoke-${Date.now()}`,
    }),
  });
  const enqueueJson = await enqueueRes.json().catch(() => ({}));
  const jobId = Number(enqueueJson.job_id || 0);
  push("Jobs enqueue API", enqueueRes.status === 201 && jobId > 0, `status=${enqueueRes.status}, job_id=${jobId || 0}`);

  const runRes = await request(`${baseWeb}/api/ops/system/jobs/run`, { method: "POST", headers: { cookie } });
  const runJson = await runRes.json().catch(() => ({}));
  push("Jobs run API", runRes.ok && runJson.ok === true, `status=${runRes.status}, ran=${String(runJson.ran)}`);

  const jobsRes = await request(`${baseWeb}/api/ops/system/jobs?limit=30`, { headers: { cookie } });
  const jobsJson = await jobsRes.json().catch(() => ({}));
  const listed = Array.isArray(jobsJson.jobs) ? jobsJson.jobs.some((j) => Number(j.id) === jobId) : false;
  push("Jobs list API", jobsRes.ok && Array.isArray(jobsJson.jobs) && listed, `status=${jobsRes.status}, listed=${String(listed)}`);

  const deadRes = await request(`${baseWeb}/api/ops/system/jobs/dead`, { headers: { cookie } });
  const deadJson = await deadRes.json().catch(() => ({}));
  push("Jobs dead API", deadRes.ok && Array.isArray(deadJson.jobs), `status=${deadRes.status}`);

  const rollupComputeRes = await request(`${baseWeb}/api/ops/analytics/trial-rollups`, {
    method: "POST",
    headers: { cookie },
  });
  const rollupComputeJson = await rollupComputeRes.json().catch(() => ({}));
  push(
    "Rollups compute API",
    rollupComputeRes.ok && rollupComputeJson.ok === true,
    `status=${rollupComputeRes.status}, day_rows=${rollupComputeJson?.result?.day_rows ?? "-"}`,
  );

  const rollupListRes = await request(`${baseWeb}/api/ops/analytics/trial-rollups?granularity=day&limit=50`, { headers: { cookie } });
  const rollupListJson = await rollupListRes.json().catch(() => ({}));
  push(
    "Rollups list API",
    rollupListRes.ok && Array.isArray(rollupListJson.rollups),
    `status=${rollupListRes.status}, items=${Array.isArray(rollupListJson.rollups) ? rollupListJson.rollups.length : 0}`,
  );

  const supportAnalyticsRes = await request(`${baseWeb}/api/ops/support/analytics`, { headers: { cookie } });
  const supportAnalyticsJson = await supportAnalyticsRes.json().catch(() => ({}));
  push(
    "Support analytics API",
    supportAnalyticsRes.ok && supportAnalyticsJson.ok === true && supportAnalyticsJson.analytics,
    `status=${supportAnalyticsRes.status}, open=${supportAnalyticsJson?.analytics?.open_tickets ?? "-"}`,
  );

  const supportRecomputeRes = await request(`${baseWeb}/api/ops/support/sla/recompute`, { method: "POST", headers: { cookie } });
  const supportRecomputeJson = await supportRecomputeRes.json().catch(() => ({}));
  push(
    "Support SLA recompute API",
    supportRecomputeRes.ok && supportRecomputeJson.ok === true,
    `status=${supportRecomputeRes.status}, updated=${supportRecomputeJson.updated ?? "-"}`,
  );

  const simRunRes = await request(`${baseWeb}/api/ops/system/simulation/run`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ scenario_name: "p3_smoke", clinics: 50, conversations_per_day: 500 }),
  });
  const simRunJson = await simRunRes.json().catch(() => ({}));
  push(
    "Simulation run API",
    simRunRes.ok && simRunJson.ok === true && Number(simRunJson.run_id || 0) > 0,
    `status=${simRunRes.status}, run_id=${simRunJson.run_id ?? "-"}, result=${simRunJson.status ?? "-"}`,
  );

  const simRunsRes = await request(`${baseWeb}/api/ops/system/simulation/runs?limit=10`, { headers: { cookie } });
  const simRunsJson = await simRunsRes.json().catch(() => ({}));
  push(
    "Simulation history API",
    simRunsRes.ok && Array.isArray(simRunsJson.runs),
    `status=${simRunsRes.status}, items=${Array.isArray(simRunsJson.runs) ? simRunsJson.runs.length : 0}`,
  );

  console.log("\nSummary:\n" + JSON.stringify(results, null, 2));
  const failed = results.filter((x) => !x.pass);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
