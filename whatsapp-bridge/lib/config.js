const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

function bool(v, defaultValue = false) {
  return String(v ?? defaultValue).toLowerCase() === "true";
}

function num(v, defaultValue) {
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

function loadConfig() {
  return {
    webhookUrl: process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/whatsapp",
    bridgePort: num(process.env.BRIDGE_PORT, 3100),
    clinicId: String(process.env.CLINIC_ID || "1").trim(),
    opsDashboardUrl: (process.env.OPS_DASHBOARD_URL || "http://127.0.0.1:3001").trim(),
    schedulingServiceToken: (process.env.SCHEDULING_SERVICE_TOKEN || "").trim(),
    /** If true, bridge shows clinic menus; otherwise ops-dashboard is the single source of replies. */
    waRoutingMenus: bool(process.env.WA_ROUTING_MENUS, false),
    replyWindowHours: num(process.env.REPLY_WINDOW_HOURS, 72),
    minReplyDelayMs: num(process.env.REPLY_MIN_DELAY_MS, 1000),
    maxReplyDelayMs: num(process.env.REPLY_MAX_DELAY_MS, 3000),
    allowGroups: bool(process.env.WA_ALLOW_GROUPS, false),
    waChromePath: (process.env.WA_CHROME_PATH || "").trim(),
    waAuthDir: (process.env.WA_AUTH_DIR || "auth-webjs").trim(),
    waHeadless: bool(process.env.WA_HEADLESS, false),
    /** مثال: `--disable-dev-shm-usage,--disable-background-networking` مفصولة بفواصل */
    waPuppeteerExtraArgs: String(process.env.WA_PUPPETEER_EXTRA_ARGS || "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    waAuthTimeoutMs: num(process.env.WA_AUTH_TIMEOUT_MS, 900000),
    inboundDedupWindowMs: num(process.env.INBOUND_DEDUP_WINDOW_MS, 120000),
    eventLogFile: (process.env.BRIDGE_EVENT_LOG_FILE || "logs/bridge-events.ndjson").trim(),
    alertUrgentTo: normalizeChatId(process.env.WA_ALERT_URGENT_TO || ""),
    urgentKeywords: ["طوارئ", "نزيف", "emergency", "urgent", "اسعاف", "ألم شديد"],
    crmDbHost: (process.env.CRM_DB_HOST || "").trim(),
    crmDbPort: num(process.env.CRM_DB_PORT, 5432),
    crmDbName: (process.env.CRM_DB_NAME || "").trim(),
    crmDbUser: (process.env.CRM_DB_USER || "").trim(),
    crmDbPassword: (process.env.CRM_DB_PASSWORD || "").trim(),
    crmDbSsl: bool(process.env.CRM_DB_SSL, false),
    aiEnabled: bool(process.env.AI_ENABLED, false),
    aiProvider: (process.env.AI_PROVIDER || "openai_compatible").trim(),
    aiModel: (process.env.AI_MODEL || "gpt-4o-mini").trim(),
    aiAllowReplyDrafts: bool(process.env.AI_ALLOW_REPLY_DRAFTS, true),
    aiMaxReplyChars: num(process.env.AI_MAX_REPLY_CHARS, 280),
    aiTimeoutMs: num(process.env.AI_TIMEOUT_MS, 30000),
    aiFailOpenToRules: bool(process.env.AI_FAIL_OPEN_TO_RULES, true),
    aiCircuitBreakerWindowMs: num(process.env.AI_CIRCUIT_BREAKER_WINDOW_MS, 60000),
    aiCircuitBreakerMaxFailures: num(process.env.AI_CIRCUIT_BREAKER_MAX_FAILURES, 5),
    /** HMAC secret for outbound webhook body (set in n8n to verify X-Bridge-Signature) */
    webhookHmacSecret: (process.env.N8N_WEBHOOK_HMAC_SECRET || "").trim(),
    /** If set, POST /send requires Authorization: Bearer <token> */
    sendApiToken: (process.env.BRIDGE_SEND_API_TOKEN || "").trim(),
    maxRepliesPerHourPerChat: num(process.env.MAX_REPLIES_PER_HOUR_PER_CHAT, 40),
    maxSendsPerMinutePerChat: num(process.env.MAX_SENDS_PER_MINUTE_PER_CHAT, 12),
    /** Optional "night mute" for /send only (local server hour 0-23). Unset = disabled */
    nightMuteStartHour: (() => {
      const v = process.env.NIGHT_MUTE_START_HOUR;
      if (v === undefined || v === null || String(v).trim() === "") return null;
      const n = num(v, -1);
      return n >= 0 && n <= 23 ? n : null;
    })(),
    nightMuteEndHour: (() => {
      const v = process.env.NIGHT_MUTE_END_HOUR;
      if (v === undefined || v === null || String(v).trim() === "") return null;
      const n = num(v, -1);
      return n >= 0 && n <= 23 ? n : null;
    })(),
    reconnectInitialMs: num(process.env.WA_RECONNECT_INITIAL_MS, 5000),
    reconnectMaxMs: num(process.env.WA_RECONNECT_MAX_MS, 300000),
    typingIndicatorMs: num(process.env.WA_TYPING_INDICATOR_MS, 0),
    outboundQueueFile: (process.env.OUTBOUND_QUEUE_FILE || "logs/outbound-queue.ndjson").trim(),
    inboundWebhookQueueFile: (process.env.INBOUND_WEBHOOK_QUEUE_FILE || "logs/inbound-webhook-queue.ndjson").trim(),
    inboundWebhookFlushIntervalMs: num(process.env.INBOUND_WEBHOOK_FLUSH_INTERVAL_MS, 30_000),
    inboundWebhookMaxAttempts: num(process.env.INBOUND_WEBHOOK_MAX_ATTEMPTS, 50),
    inboundWebhookMaxAgeMs: num(process.env.INBOUND_WEBHOOK_MAX_AGE_MS, 86_400_000),
    sendMaxRetries: num(process.env.SEND_MAX_RETRIES, 3),
    sendRetryBaseMs: num(process.env.SEND_RETRY_BASE_MS, 800),
    sendAckTimeoutMs: num(process.env.SEND_ACK_TIMEOUT_MS, 120_000),
    waCbWindowMs: num(process.env.WA_CB_WINDOW_MS, 600_000),
    waCbDisconnectThreshold: num(process.env.WA_CB_DISCONNECT_THRESHOLD, 5),
    waCbCooldownMs: num(process.env.WA_CB_COOLDOWN_MS, 300_000),
    waRepairCacheOnCircuit: bool(process.env.WA_REPAIR_CACHE_ON_CIRCUIT, false),
    memoryWatchdogIntervalMs: num(process.env.MEMORY_WATCHDOG_INTERVAL_MS, 60_000),
    memoryHeapRatioWarn: Number(process.env.MEMORY_HEAP_RATIO_WARN || 0.88),
    gracefulShutdownMs: num(process.env.GRACEFUL_SHUTDOWN_MS, 25_000),
  };
}

function normalizeChatId(rawId) {
  const value = String(rawId || "").trim();
  if (!value) return "";
  if (value.endsWith("@c.us") || value.endsWith("@g.us") || value.endsWith("@lid")) return value;
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return `${digits}@c.us`;
}

module.exports = { loadConfig, normalizeChatId };
