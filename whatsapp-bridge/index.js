const { loadConfig, normalizeChatId } = require("./lib/config");
const { createEventLogger } = require("./lib/eventLog");
const { createMetrics } = require("./lib/metrics");
const { createRateLimiter } = require("./lib/rateLimit");
const { createRateSafety } = require("./lib/safety/rateSafety");
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
const rateSafety = createRateSafety({});

const wa = createWaSessionManager(config, {
  logEvent,
  metrics,
  normalizeChatId,
  alertUrgentTo: config.alertUrgentTo,
});

createHttpServer(config, {
  logEvent,
  metrics,
  rateLimiter,
  rateSafety,
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
