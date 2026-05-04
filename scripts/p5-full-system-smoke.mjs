const baseWeb = process.env.P5_BASE_WEB || "http://127.0.0.1:3000";
const baseOps = process.env.P5_BASE_OPS || "http://127.0.0.1:3001";
const schedulingServiceToken = process.env.SCHEDULING_SERVICE_TOKEN || "mid-auto-local-dev-token-32chars-minimum!!";

const results = [];
const nowTag = Date.now();

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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTempoTraceWithRetry(traceId, attempts = 6, delayMs = 1200) {
  let lastStatus = 0;
  let lastJson = {};
  for (let i = 0; i < attempts; i += 1) {
    const r = await request(`http://127.0.0.1:3200/api/traces/${traceId}`);
    lastStatus = r.status;
    lastJson = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(lastJson?.batches) && lastJson.batches.length > 0) {
      return { ok: true, status: r.status, attempts: i + 1 };
    }
    if (i < attempts - 1) {
      await sleep(delayMs);
    }
  }
  return { ok: false, status: lastStatus, attempts, lastJson };
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
    push("Login", false, "could_not_login_with_known_credentials");
    console.log("\nSummary:\n" + JSON.stringify(results, null, 2));
    process.exit(1);
  }
  push("Login", true, "session_cookie_issued");

  const meRes = await request(`${baseWeb}/api/auth/me`, { headers: { cookie } });
  const meJson = await meRes.json().catch(() => ({}));
  const clinicId = Number(meJson.clinic_id || 0);
  const userId = Number(meJson.user_id || 0);
  push("Auth /api/auth/me", meRes.ok && clinicId > 0 && userId > 0, `status=${meRes.status}, clinic=${clinicId}, user=${userId}`);

  const spoof = await request(`${baseWeb}/api/ops/billing/local?clinic_id=999999`, { headers: { cookie } });
  const spoofJson = await spoof.json().catch(() => ({}));
  const scopedClinic = Number(spoofJson?.snapshot?.clinic_id || 0);
  push(
    "Tenant isolation (clinic spoof)",
    spoof.ok && clinicId > 0 && scopedClinic === clinicId,
    `requested=999999 resolved=${scopedClinic} session=${clinicId}`,
  );

  const subject = `P5 smoke ticket ${nowTag}`;
  const createTicket = await request(`${baseWeb}/api/ops/support/tickets`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ subject, priority: "normal", message: "P5 support create" }),
  });
  const createTicketJson = await createTicket.json().catch(() => ({}));
  const ticketId = Number(createTicketJson?.ticket?.id || 0);
  const assign = await request(`${baseWeb}/api/ops/support/assign`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, assigned_to: userId }),
  });
  const escalate = await request(`${baseWeb}/api/ops/support/escalate`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, reason: "p5 escalation smoke" }),
  });
  const resolve = await request(`${baseWeb}/api/ops/support/tickets`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, status: "resolved" }),
  });
  const listTickets = await request(`${baseWeb}/api/ops/support/tickets`, { headers: { cookie } });
  const listTicketsJson = await listTickets.json().catch(() => ({}));
  const finalTicket = (listTicketsJson?.tickets || []).find((t) => Number(t.id) === ticketId);
  push(
    "Support lifecycle",
    createTicket.ok && ticketId > 0 && assign.ok && escalate.ok && resolve.ok && finalTicket?.status === "resolved",
    `ticket=${ticketId || 0} final=${finalTicket?.status || "missing"}`,
  );

  const createNotif = await request(`${baseWeb}/api/ops/notifications`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      type: "p5_smoke",
      title: `P5 Smoke ${nowTag}`,
      body: "P5 notification flow",
    }),
  });
  const createNotifJson = await createNotif.json().catch(() => ({}));
  const notifId = Number(createNotifJson?.notification?.id || 0);
  const markRead = await request(`${baseWeb}/api/ops/notifications`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ id: notifId }),
  });
  const listNotif = await request(`${baseWeb}/api/ops/notifications`, { headers: { cookie } });
  const listNotifJson = await listNotif.json().catch(() => ({}));
  const notif = (listNotifJson?.notifications || []).find((n) => Number(n.id) === notifId);
  push(
    "Notifications flow",
    createNotif.ok && notifId > 0 && markRead.ok && notif?.read === true,
    `notification=${notifId || 0} read=${String(notif?.read)}`,
  );

  const enqueue = await request(`${baseWeb}/api/ops/system/jobs`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      job_type: "analytics.trial.rollup.compute",
      queue_key: "default",
      priority: 40,
      payload: { source: "p5_smoke" },
      idempotency_key: `p5-smoke-${nowTag}`,
    }),
  });
  const enqueueJson = await enqueue.json().catch(() => ({}));
  const jobId = Number(enqueueJson.job_id || 0);
  const run = await request(`${baseWeb}/api/ops/system/jobs/run`, { method: "POST", headers: { cookie } });
  const jobsList = await request(`${baseWeb}/api/ops/system/jobs?limit=30`, { headers: { cookie } });
  const jobsListJson = await jobsList.json().catch(() => ({}));
  const listed = Array.isArray(jobsListJson.jobs) ? jobsListJson.jobs.some((j) => Number(j.id) === jobId) : false;
  const jobsDead = await request(`${baseWeb}/api/ops/system/jobs/dead`, { headers: { cookie } });
  const jobsDeadJson = await jobsDead.json().catch(() => ({}));
  push(
    "Jobs flow",
    enqueue.status === 201 && jobId > 0 && run.ok && jobsList.ok && listed && jobsDead.ok && Array.isArray(jobsDeadJson.jobs),
    `enqueue=${enqueue.status} job=${jobId || 0} listed=${listed} dead_status=${jobsDead.status}`,
  );

  const rollupCompute = await request(`${baseWeb}/api/ops/analytics/trial-rollups`, { method: "POST", headers: { cookie } });
  const rollupComputeJson = await rollupCompute.json().catch(() => ({}));
  const rollupList = await request(`${baseWeb}/api/ops/analytics/trial-rollups?granularity=day&limit=50`, { headers: { cookie } });
  const rollupListJson = await rollupList.json().catch(() => ({}));
  push(
    "Analytics rollups flow",
    rollupCompute.ok && rollupComputeJson.ok === true && rollupList.ok && Array.isArray(rollupListJson.rollups),
    `compute=${rollupCompute.status} list=${rollupList.status} rows=${Array.isArray(rollupListJson.rollups) ? rollupListJson.rollups.length : 0}`,
  );

  const requestId = crypto.randomUUID();
  const traceId = requestId.replaceAll("-", "");
  const obsHeaders = {
    Authorization: `Bearer ${schedulingServiceToken}`,
    "Content-Type": "application/json",
  };
  const obsStart = await request(`${baseOps}/api/internal/observability/trace`, {
    method: "POST",
    headers: obsHeaders,
    body: JSON.stringify({
      action: "start",
      request_id: requestId,
      trace_id: traceId,
      source_app: "p5-smoke",
      path: "/smoke/p5",
      method: "POST",
      clinic_id: clinicId,
      user_id: userId,
      payload: { smoke: true, stage: "start" },
    }),
  });
  const obsLog = await request(`${baseOps}/api/internal/observability/trace`, {
    method: "POST",
    headers: obsHeaders,
    body: JSON.stringify({
      action: "log",
      request_id: requestId,
      trace_id: traceId,
      clinic_id: clinicId,
      user_id: userId,
      level: "info",
      event_name: "p5.smoke.trace_log_flow",
      entity_id: "p5-smoke",
      payload: { flow: "start->log->finish" },
    }),
  });
  const obsFinish = await request(`${baseOps}/api/internal/observability/trace`, {
    method: "POST",
    headers: obsHeaders,
    body: JSON.stringify({
      action: "finish",
      request_id: requestId,
      trace_id: traceId,
      status_code: 200,
      duration_ms: 123,
    }),
  });
  const timeline = await request(`${baseOps}/api/internal/system/timeline?limit=40`, {
    headers: { Authorization: `Bearer ${schedulingServiceToken}`, "x-clinic-id": String(clinicId) },
  });
  const timelineJson = await timeline.json().catch(() => ({}));
  const timelineFound = Array.isArray(timelineJson.timeline)
    ? timelineJson.timeline.some((e) => e?.event_name === "p5.smoke.trace_log_flow")
    : false;
  const lokiJob = `p5-smoke-${nowTag}`;
  const lokiPush = await request("http://127.0.0.1:3100/loki/api/v1/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      streams: [
        {
          stream: { job: lokiJob, service_name: "p5-smoke" },
          values: [[`${BigInt(Date.now()) * 1000000n}`, "p5 observability smoke log"]],
        },
      ],
    }),
  });
  await sleep(800);
  const lokiQuery = await request(`http://127.0.0.1:3100/loki/api/v1/query?query=${encodeURIComponent(`{job="${lokiJob}"}`)}`);
  const lokiQueryJson = await lokiQuery.json().catch(() => ({}));
  const lokiFound = Array.isArray(lokiQueryJson?.data?.result) && lokiQueryJson.data.result.length > 0;
  const tempoTraceId = crypto.randomUUID().replaceAll("-", "");
  const startNs = BigInt(Date.now()) * 1000000n;
  const tempoIngest = await request("http://127.0.0.1:4318/v1/traces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "p5-smoke" } }],
          },
          scopeSpans: [
            {
              scope: { name: "p5.scope" },
              spans: [
                {
                  traceId: tempoTraceId,
                  spanId: "1a2b3c4d5e6f7a8b",
                  name: "p5-smoke-span",
                  kind: "SPAN_KIND_INTERNAL",
                  startTimeUnixNano: `${startNs}`,
                  endTimeUnixNano: `${startNs + 5_000_000n}`,
                },
              ],
            },
          ],
        },
      ],
    }),
  });
  const tempoQuery = await fetchTempoTraceWithRetry(tempoTraceId, 6, 1200);
  push(
    "Observability flow (trace/timeline/loki/tempo)",
    obsStart.ok &&
      obsLog.ok &&
      obsFinish.ok &&
      timeline.ok &&
      timelineFound &&
      lokiPush.ok &&
      lokiQuery.ok &&
      lokiFound &&
      tempoIngest.ok &&
      tempoQuery.ok,
    `trace_api=${obsStart.status}/${obsLog.status}/${obsFinish.status} timeline=${timeline.status}:${timelineFound} loki=${lokiPush.status}/${lokiQuery.status}:${lokiFound} tempo=${tempoIngest.status}/${tempoQuery.status}:${tempoQuery.attempts}`,
  );

  const emergencyStatusBefore = await request(`${baseWeb}/api/ops/system/emergency/status`, { headers: { cookie } });
  const emergencyToggleOn = await request(`${baseWeb}/api/ops/system/emergency/toggle`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      mode: "emergency_mode",
      enabled: true,
      reason: "p5 emergency toggle on",
    }),
  });
  const emergencyOnJson = await emergencyToggleOn.json().catch(() => ({}));
  const emergencyToggleOff = await request(`${baseWeb}/api/ops/system/emergency/toggle`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      mode: "emergency_mode",
      enabled: false,
      reason: "p5 emergency toggle off",
    }),
  });
  const emergencyOffJson = await emergencyToggleOff.json().catch(() => ({}));
  const emergencyTimeline = await request(`${baseOps}/api/internal/system/timeline?limit=80`, {
    headers: { Authorization: `Bearer ${schedulingServiceToken}`, "x-clinic-id": String(clinicId) },
  });
  const emergencyTimelineJson = await emergencyTimeline.json().catch(() => ({}));
  const emergencyTimelineFound = Array.isArray(emergencyTimelineJson?.timeline)
    ? emergencyTimelineJson.timeline.some((e) => e?.event_name === "system.emergency.flag_toggle")
    : false;
  push(
    "Emergency mode toggle flow",
    emergencyStatusBefore.ok &&
      emergencyToggleOn.ok &&
      emergencyToggleOff.ok &&
      emergencyOnJson?.emergency?.emergency_mode === true &&
      emergencyOffJson?.emergency?.emergency_mode === false &&
      emergencyTimelineFound,
    `status=${emergencyStatusBefore.status} on=${emergencyToggleOn.status} off=${emergencyToggleOff.status} timeline=${emergencyTimeline.status}:${emergencyTimelineFound}`,
  );

  const fp = `p5-fp-${nowTag}`;
  const vat = `P5-VAT-${nowTag}`;
  const trialA = await request(`${baseWeb}/api/trial/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clinicName: `P5 Clinic A ${nowTag}`,
      ownerName: "P5 Owner A",
      whatsapp: `+9639500${String(nowTag).slice(-4)}`,
      city: "Damascus",
      specialty: "General",
      doctorsCount: 1,
      email: `p5-a-${nowTag}@example.com`,
      password: "Admin12345!",
      confirmPassword: "Admin12345!",
      browserFingerprint: fp,
      vat,
    }),
  });
  const trialB = await request(`${baseWeb}/api/trial/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clinicName: `P5 Clinic B ${nowTag}`,
      ownerName: "P5 Owner B",
      whatsapp: `+9639511${String(nowTag).slice(-4)}`,
      city: "Damascus",
      specialty: "General",
      doctorsCount: 1,
      email: `p5-b-${nowTag}@example.com`,
      password: "Admin12345!",
      confirmPassword: "Admin12345!",
      browserFingerprint: fp,
      vat,
    }),
  });
  const trialAJson = await trialA.json().catch(() => ({}));
  const trialBJson = await trialB.json().catch(() => ({}));
  const strictPass = trialA.status === 201 && trialB.status === 409;
  const preBlockedPass =
    trialA.status === 409 &&
    trialB.status === 409 &&
    trialAJson?.error === "trial_identity_blocked" &&
    trialBJson?.error === "trial_identity_blocked";
  push(
    "Anti-abuse trial duplication",
    strictPass || preBlockedPass,
    `first=${trialA.status}(${trialAJson?.error || "-"}) second=${trialB.status}(${trialBJson?.error || "-"})`,
  );

  console.log("\nSummary:\n" + JSON.stringify(results, null, 2));
  const failed = results.filter((x) => !x.pass);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
