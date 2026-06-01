const { loadConfig, normalizeChatId } = require("./lib/config");
const { createEventLogger } = require("./lib/eventLog");
const { createMetrics } = require("./lib/metrics");
const { createRateLimiter } = require("./lib/rateLimit");
const { createRateSafety } = require("./lib/safety/rateSafety");
const { createDailyCaps } = require("./lib/safety/dailyCaps");
const { createBroadcastDetector } = require("./lib/safety/broadcastDetector");
const { createWarmup } = require("./lib/safety/warmup");
const { createOutboundGates } = require("./lib/safety/outboundGates");
const { createAuditWriter } = require("./lib/safety/auditWriter");
const { createHttpServer } = require("./lib/httpServer");
const { createWaSessionManager } = require("./lib/waSession");
const { startMemoryWatchdog } = require("./lib/memoryWatchdog");

const config = loadConfig();
const { logEvent } = createEventLogger(config.eventLogFile);
const metrics = createMetrics();
const rateLimiter = createRateLimiter({
  maxPerHour: config.maxRepliesPerHourPerChat,
  maxPerMinute: config.maxSendsPerMinutePerChat,
});
const rateSafety = createRateSafety({
  minMsSameChat: config.safetyMinIntervalMs,
  maxGlobalPerMinute: config.safetyMaxGlobalPerMinute,
  jitterMinMs: config.safetyJitterMinMs,
  jitterMaxMs: config.safetyJitterMaxMs,
});

// In-process state used by warm-up (paired_at). Bridge updates `pairedAt`
// on READY if it hadn't been set yet. ops-dashboard mirrors this to
// `wa_number_state.paired_at` so the admin UI can show warm-up progress.
const numberState = { pairedAt: null };

const warmup = createWarmup({
  getPairedAt: () => numberState.pairedAt,
  configuredGlobalDaily: config.maxSendsPerDayGlobal,
});

const dailyCaps = createDailyCaps({
  stateFile: config.dailyCapsStateFile,
  maxPerChat: config.maxRepliesPerDayPerChat,
  // Warm-up dynamically reduces the global cap during the first 7 days.
  // We pass the configured value; the gate reads warm-up at gate time.
  maxGlobal: config.maxSendsPerDayGlobal,
  maxSameTextPerDay: config.maxSameTextPerDay,
});

async function postAlertWebhook(payload) {
  if (!config.alertWebhookUrl) return;
  try {
    await fetch(config.alertWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    logEvent("alert_webhook_failed", {
      error: e && e.message ? String(e.message) : String(e),
    });
  }
}

const broadcastDetector = createBroadcastDetector({
  windowMs: config.broadcastWindowMs,
  uniqueChatsThreshold: config.broadcastUniqueChatsThreshold,
  pauseMs: config.broadcastPauseMs,
  onTrip: (info) => {
    metrics.inc("broadcast_circuit_trips_total");
    logEvent("broadcast_circuit_trip", info);
    void postAlertWebhook({
      type: "wa_broadcast_circuit_open",
      ...info,
      ts: new Date().toISOString(),
    });
  },
});

// Expose anti-ban gauges to Prometheus scrape.
metrics.setGaugeProvider(() => {
  const w = warmup.getState();
  const d = dailyCaps.snapshot();
  const b = broadcastDetector.snapshot();
  return {
    warmup_remaining_days: w.remaining_days,
    daily_cap_global_usage: d.usage_global_pct,
    broadcast_circuit_paused: b.paused ? 1 : 0,
  };
});

// Periodic cap-usage alert: fires once every >=15 min when usage crosses 0.85.
let lastCapAlertAt = 0;
setInterval(() => {
  const d = dailyCaps.snapshot();
  if (d.usage_global_pct >= 0.85 && Date.now() - lastCapAlertAt > 15 * 60_000) {
    lastCapAlertAt = Date.now();
    logEvent("wa_daily_cap_high", { usage_pct: d.usage_global_pct, global: d.global, max: d.maxGlobal });
    void postAlertWebhook({
      type: "wa_daily_cap_high",
      usage_pct: d.usage_global_pct,
      global: d.global,
      max: d.maxGlobal,
      ts: new Date().toISOString(),
    });
  }
}, 60_000).unref();

const auditWriter = createAuditWriter({
  enabled: config.auditEnabled,
  endpoint: config.auditEndpointUrl,
  token: config.auditEndpointToken,
  metrics,
  logEvent,
  provider: "whatsapp_web_js",
});

const wa = createWaSessionManager(config, {
  logEvent,
  metrics,
  normalizeChatId,
  alertUrgentTo: config.alertUrgentTo,
  numberState,
  auditWriter,
  dailyCaps,
  broadcastDetector,
  warmup,
  rateLimiter,
  rateSafety,
});

const outboundGates = createOutboundGates(config, {
  metrics,
  logEvent,
  rateLimiter,
  rateSafety,
  dailyCaps,
  broadcastDetector,
  warmup,
  ensureReplyAllowed: (to) => wa.ensureReplyAllowed(to),
});

createHttpServer(config, {
  logEvent,
  metrics,
  rateLimiter,
  rateSafety,
  outboundGates,
  dailyCaps,
  warmup,
  broadcastDetector,
  auditWriter,
  getReady: () => wa.getReady(),
  getWaClient: () => wa.getWaClient(),
  normalizeChatId,
  ensureReplyAllowed: (to) => wa.ensureReplyAllowed(to),
  queueSend: (to, text) => wa.queueSend(to, text),
});

const stopMemoryWatchdog = startMemoryWatchdog({
  logEvent,
  metrics,
  intervalMs: config.memoryWatchdogIntervalMs,
  ratioThreshold: config.memoryHeapRatioWarn,
});

wa.start();

function shutdown(signal) {
  console.log(`[bridge] shutdown (${signal})`);
  logEvent("bridge_shutdown", { signal: String(signal) });
  stopMemoryWatchdog();
  void wa.shutdown().finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
