const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

function bool(v, defaultValue = false) {
  return String(v ?? defaultValue).toLowerCase() === "true";
}

function num(v, defaultValue) {
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

/** `ops` = POST process-inbound on ops-dashboard; `n8n` = POST N8N_WEBHOOK_URL */
function resolveInboundForwardMode() {
  const explicit = String(process.env.BRIDGE_INBOUND_FORWARD || "").trim().toLowerCase();
  if (explicit === "ops" || explicit === "n8n") return explicit;
  const primary = String(process.env.OPS_WHATSAPP_PRIMARY_HANDLER || "").trim().toLowerCase();
  if (primary === "ops") return "ops";
  return "n8n";
}

function loadConfig() {
  const opsDashboardUrl = (process.env.OPS_DASHBOARD_URL || "http://127.0.0.1:3001").trim().replace(/\/$/, "");
  const inboundForwardMode = resolveInboundForwardMode();
  return {
    inboundForwardMode,
    processInboundUrl: `${opsDashboardUrl}/api/internal/conversations/process-inbound`,
    webhookUrl: process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/whatsapp",
    bridgePort: num(process.env.BRIDGE_PORT, 3100),
    /** Listen address. Use 0.0.0.0 on the VPS so ops-dashboard (Docker) can reach the bridge via host.docker.internal. 127.0.0.1 breaks container health checks. */
    bridgeBindHost: String(process.env.BRIDGE_BIND_HOST || "0.0.0.0").trim() || "0.0.0.0",
    clinicId: String(process.env.CLINIC_ID || "1").trim(),
    opsDashboardUrl,
    schedulingServiceToken: (process.env.SCHEDULING_SERVICE_TOKEN || "").trim(),
    /** If true, bridge shows clinic menus; otherwise ops-dashboard is the single source of replies. */
    waRoutingMenus: bool(process.env.WA_ROUTING_MENUS, false),
    replyWindowHours: num(process.env.REPLY_WINDOW_HOURS, 72),
    // Human-paced jitter before every send. Widened defaults to reduce ban
    // risk on unofficial whatsapp-web.js (was 1000/3000).
    minReplyDelayMs: num(process.env.REPLY_MIN_DELAY_MS, 1800),
    maxReplyDelayMs: num(process.env.REPLY_MAX_DELAY_MS, 5500),
    // Anti-ban rate-safety knobs (read by createRateSafety in index.js)
    safetyMinIntervalMs: num(process.env.BRIDGE_SAFETY_MIN_INTERVAL_MS, 4000),
    safetyMaxGlobalPerMinute: num(process.env.BRIDGE_SAFETY_MAX_GLOBAL_PER_MIN, 15),
    safetyJitterMinMs: num(process.env.BRIDGE_JITTER_MIN_MS, 1500),
    safetyJitterMaxMs: num(process.env.BRIDGE_JITTER_MAX_MS, 4500),
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
    /** When true, refuse /send if BRIDGE_SEND_API_TOKEN is unset (auto true when NODE_ENV=production). */
    requireSendApiToken:
      String(process.env.NODE_ENV || "").toLowerCase() === "production" ||
      bool(process.env.BRIDGE_REQUIRE_SEND_TOKEN, false),
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
    // Default ON (900ms) to look human: was 0. Override per-deploy if needed.
    typingIndicatorMs: num(process.env.WA_TYPING_INDICATOR_MS, 900),
    // Anti-ban daily caps (lib/safety/dailyCaps.js)
    maxRepliesPerDayPerChat: num(process.env.MAX_REPLIES_PER_DAY_PER_CHAT, 60),
    maxSendsPerDayGlobal: num(process.env.MAX_SENDS_PER_DAY_GLOBAL, 1500),
    maxSameTextPerDay: num(process.env.MAX_SAME_TEXT_PER_DAY, 200),
    dailyCapsStateFile: (process.env.DAILY_CAPS_STATE_FILE || "logs/daily-caps-state.ndjson").trim(),
    // Broadcast-pattern detector (lib/safety/broadcastDetector.js)
    broadcastWindowMs: num(process.env.BRIDGE_BROADCAST_WINDOW_MS, 600_000),
    broadcastUniqueChatsThreshold: num(process.env.BRIDGE_BROADCAST_UNIQUE_CHATS, 12),
    broadcastPauseMs: num(process.env.BRIDGE_BROADCAST_PAUSE_MS, 300_000),
    // Audit hook → ops-dashboard /api/internal/wa-audit/record
    auditEndpointUrl: (process.env.BRIDGE_AUDIT_ENDPOINT_URL || "").trim(),
    auditEndpointToken: (process.env.BRIDGE_AUDIT_ENDPOINT_TOKEN || process.env.SCHEDULING_SERVICE_TOKEN || "").trim(),
    auditEnabled: bool(process.env.BRIDGE_AUDIT_ENABLED, false),
    // Alert webhook for circuit/disconnect/cap-usage events
    alertWebhookUrl: (process.env.ALERT_WEBHOOK_URL || "").trim(),
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
