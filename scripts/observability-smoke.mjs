const cfg = {
  collectorHealthUrl: process.env.OTEL_COLLECTOR_HEALTH_URL || "http://127.0.0.1:13133/",
  collectorOtlpHttpUrl: process.env.OTEL_COLLECTOR_OTLP_HTTP_URL || "http://127.0.0.1:4318/v1/traces",
  lokiReadyUrl: process.env.LOKI_READY_URL || "http://127.0.0.1:3100/ready",
  lokiPushUrl: process.env.LOKI_PUSH_URL || "http://127.0.0.1:3100/loki/api/v1/push",
  lokiQueryUrl: process.env.LOKI_QUERY_URL || "http://127.0.0.1:3100/loki/api/v1/query",
  tempoReadyUrl: process.env.TEMPO_READY_URL || "http://127.0.0.1:3200/ready",
  tempoTraceApiBase: process.env.TEMPO_TRACE_API_BASE || "http://127.0.0.1:3200/api/traces",
  grafanaHealthUrl: process.env.GRAFANA_HEALTH_URL || "http://127.0.0.1:3002/api/health",
  opsObservabilityTraceUrl:
    process.env.OPS_OBSERVABILITY_TRACE_URL || "http://127.0.0.1:3001/api/internal/observability/trace",
  opsTimelineUrl: process.env.OPS_TIMELINE_URL || "http://127.0.0.1:3001/api/internal/system/timeline?limit=30",
  schedulingServiceToken: process.env.SCHEDULING_SERVICE_TOKEN || "mid-auto-local-dev-token-32chars-minimum!!",
  clinicId: Number(process.env.SMOKE_CLINIC_ID || 1),
  userId: Number(process.env.SMOKE_USER_ID || 1),
};

const results = [];

function addResult(name, pass, details) {
  results.push({ name, pass, details });
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}: ${details}`);
}

async function checkStatus(name, url, expected = 200) {
  try {
    const r = await fetch(url);
    addResult(name, r.status === expected, `status=${r.status} expected=${expected}`);
    return r.status === expected;
  } catch (error) {
    addResult(name, false, `error=${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function unixNanoNowString() {
  return `${BigInt(Date.now()) * 1000000n}`;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTraceWithRetry(traceUrl, attempts = 6, delayMs = 1200) {
  let lastStatus = 0;
  let lastJson = {};
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetch(traceUrl);
    lastStatus = res.status;
    lastJson = await res.json().catch(() => ({}));
    const hasBatches = Array.isArray(lastJson?.batches) && lastJson.batches.length > 0;
    if (res.ok && hasBatches) {
      return { ok: true, status: res.status, json: lastJson, attemptsUsed: i + 1 };
    }
    if (i < attempts - 1) {
      await sleep(delayMs);
    }
  }
  return { ok: false, status: lastStatus, json: lastJson, attemptsUsed: attempts };
}

async function main() {
  await checkStatus("Collector health", cfg.collectorHealthUrl);
  await checkStatus("Loki readiness", cfg.lokiReadyUrl);
  await checkStatus("Tempo readiness", cfg.tempoReadyUrl);
  await checkStatus("Grafana health", cfg.grafanaHealthUrl);

  const requestId = crypto.randomUUID();
  const traceIdHex = requestId.replaceAll("-", "");
  const traceHeaders = {
    Authorization: `Bearer ${cfg.schedulingServiceToken}`,
    "Content-Type": "application/json",
  };

  try {
    const startRes = await fetch(cfg.opsObservabilityTraceUrl, {
      method: "POST",
      headers: traceHeaders,
      body: JSON.stringify({
        action: "start",
        request_id: requestId,
        trace_id: traceIdHex,
        source_app: "observability-smoke",
        path: "/smoke/observability",
        method: "POST",
        clinic_id: cfg.clinicId,
        user_id: cfg.userId,
        payload: { smoke: true },
      }),
    });
    const logRes = await fetch(cfg.opsObservabilityTraceUrl, {
      method: "POST",
      headers: traceHeaders,
      body: JSON.stringify({
        action: "log",
        request_id: requestId,
        trace_id: traceIdHex,
        clinic_id: cfg.clinicId,
        user_id: cfg.userId,
        level: "info",
        event_name: "smoke.trace_log_flow",
        entity_id: "observability-smoke",
        payload: { flow: "trace->log->timeline" },
      }),
    });
    const finishRes = await fetch(cfg.opsObservabilityTraceUrl, {
      method: "POST",
      headers: traceHeaders,
      body: JSON.stringify({
        action: "finish",
        request_id: requestId,
        trace_id: traceIdHex,
        status_code: 200,
        duration_ms: 123,
      }),
    });
    const ok = startRes.ok && logRes.ok && finishRes.ok;
    addResult("Ops trace/log ingestion", ok, `start=${startRes.status} log=${logRes.status} finish=${finishRes.status}`);
  } catch (error) {
    addResult("Ops trace/log ingestion", false, `error=${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const timelineRes = await fetch(cfg.opsTimelineUrl, {
      headers: {
        Authorization: `Bearer ${cfg.schedulingServiceToken}`,
        "x-clinic-id": String(cfg.clinicId),
      },
    });
    const timelineJson = await timelineRes.json().catch(() => ({}));
    const found = Array.isArray(timelineJson.timeline)
      ? timelineJson.timeline.some((e) => e?.event_name === "smoke.trace_log_flow")
      : false;
    addResult("Timeline correlation event", timelineRes.ok && found, `status=${timelineRes.status} found=${found}`);
  } catch (error) {
    addResult("Timeline correlation event", false, `error=${error instanceof Error ? error.message : String(error)}`);
  }

  const lokiJob = `smoke-${Date.now()}`;
  try {
    const ts = unixNanoNowString();
    const pushPayload = {
      streams: [
        {
          stream: { job: lokiJob, service_name: "midauto-observability-smoke" },
          values: [[ts, "observability smoke log line"]],
        },
      ],
    };
    const pushRes = await fetch(cfg.lokiPushUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pushPayload),
    });
    await new Promise((r) => setTimeout(r, 800));
    const queryRes = await fetch(`${cfg.lokiQueryUrl}?query=${encodeURIComponent(`{job="${lokiJob}"}`)}`);
    const queryJson = await queryRes.json().catch(() => ({}));
    const hasLog = Array.isArray(queryJson?.data?.result) && queryJson.data.result.length > 0;
    addResult("Loki log push/query flow", pushRes.ok && queryRes.ok && hasLog, `push=${pushRes.status} query=${queryRes.status} result=${hasLog}`);
  } catch (error) {
    addResult("Loki log push/query flow", false, `error=${error instanceof Error ? error.message : String(error)}`);
  }

  const tempoTraceHex = crypto.randomUUID().replaceAll("-", "");
  try {
    const startNs = BigInt(unixNanoNowString());
    const endNs = startNs + 5_000_000n;
    const otlpPayload = {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "midauto-observability-smoke" } }],
          },
          scopeSpans: [
            {
              scope: { name: "smoke.scope" },
              spans: [
                {
                  traceId: tempoTraceHex,
                  spanId: "1a2b3c4d5e6f7a8b",
                  name: "smoke-span",
                  kind: "SPAN_KIND_INTERNAL",
                  startTimeUnixNano: `${startNs}`,
                  endTimeUnixNano: `${endNs}`,
                  attributes: [{ key: "smoke.test", value: { stringValue: "true" } }],
                },
              ],
            },
          ],
        },
      ],
    };
    const postRes = await fetch(cfg.collectorOtlpHttpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(otlpPayload),
    });
    const fetchResult = await fetchTraceWithRetry(`${cfg.tempoTraceApiBase}/${tempoTraceHex}`, 6, 1200);
    const spanFound = Array.isArray(fetchResult?.json?.batches) && fetchResult.json.batches.length > 0;
    addResult(
      "Tempo trace ingest/query flow",
      postRes.ok && fetchResult.ok && spanFound,
      `post=${postRes.status} get=${fetchResult.status} spans=${spanFound} attempts=${fetchResult.attemptsUsed}`,
    );
  } catch (error) {
    addResult("Tempo trace ingest/query flow", false, `error=${error instanceof Error ? error.message : String(error)}`);
  }

  console.log("\nSummary:\n" + JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
