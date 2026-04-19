const fs = require("fs");
const axios = require("axios");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { signPayload } = require("./webhookSign");
const { createWaCircuit } = require("./waCircuit");
const { createDiskSendQueue } = require("./diskSendQueue");
const { createInboundWebhookQueue } = require("./inboundWebhookQueue");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(config) {
  const min = Math.max(0, config.minReplyDelayMs);
  const max = Math.max(min, config.maxReplyDelayMs);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildTextFingerprint(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function resolveChromeExecutablePath(config) {
  if (config.waChromePath && fs.existsSync(config.waChromePath)) {
    return config.waChromePath;
  }
  const candidatePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function isUrgentText(text, keywords) {
  const content = String(text || "").toLowerCase();
  return keywords.some((keyword) => content.includes(keyword.toLowerCase()));
}

/** @param {object} config from loadConfig() @param {{ logEvent: Function, metrics: object, normalizeChatId: Function, alertUrgentTo: string }} ctx */
function createWaSessionManager(config, ctx) {
  const { logEvent, metrics, normalizeChatId } = ctx;
  const circuit = createWaCircuit(config, { logEvent, metrics });
  const diskQueue = createDiskSendQueue(config.outboundQueueFile);
  const inboundWebhookQueue = createInboundWebhookQueue(config.inboundWebhookQueueFile);

  const state = {
    isReady: false,
    waClient: null,
    sendQueue: Promise.resolve(),
    lastInboundByChat: new Map(),
    lastOutboundByChat: new Map(),
    inboundFingerprintByChat: new Map(),
    pendingAcks: new Map(),
    reconnectTimer: null,
    reconnectAttempt: 0,
    shuttingDown: false,
    heartbeatTimer: null,
  };

  function shouldSkipDuplicateInbound(chatId, text) {
    const fingerprint = buildTextFingerprint(text);
    if (!fingerprint) return false;
    const mapKey = `${chatId}::${fingerprint}`;
    const now = Date.now();
    const lastSeen = state.inboundFingerprintByChat.get(mapKey);
    state.inboundFingerprintByChat.set(mapKey, now);
    if (!lastSeen) return false;
    return now - lastSeen <= config.inboundDedupWindowMs;
  }

  function clearReconnectTimer() {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  }

  function updateOldestInboundGauge() {
    const now = Date.now();
    let maxSec = 0;
    for (const [chatId, inboundAt] of state.lastInboundByChat.entries()) {
      const outAt = state.lastOutboundByChat.get(chatId) || 0;
      if (outAt < inboundAt) {
        maxSec = Math.max(maxSec, (now - inboundAt) / 1000);
      }
    }
    metrics.setGauge("bridge_oldest_inbound_reply_seconds", Math.floor(maxSec));
  }

  async function flushInboundWebhookQueue() {
    if (state.shuttingDown) return;
    const jobs = inboundWebhookQueue.readAll();
    if (!jobs.length) {
      metrics.setGauge("bridge_inbound_webhook_queue_depth", 0);
      return;
    }
    metrics.setGauge("bridge_inbound_webhook_queue_depth", jobs.length);
    const kept = [];
    const now = Date.now();
    for (const j of jobs) {
      if (!j.raw) continue;
      if (now - (j.enqueuedAt || 0) > config.inboundWebhookMaxAgeMs) {
        logEvent("inbound_webhook_drop_stale", { from: j.from });
        continue;
      }
      try {
        const hdr = { "Content-Type": "application/json" };
        if (config.webhookHmacSecret) {
          hdr["X-Bridge-Signature"] = `sha256=${signPayload(config.webhookHmacSecret, j.raw)}`;
        }
        const res = await axios.post(config.webhookUrl, j.raw, {
          headers: hdr,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
        const data = res.data;
        if (data && typeof data === "object" && data.ok === false && String(data.error || "").toLowerCase().includes("hmac")) {
          logEvent("inbound_webhook_drop_hmac", { from: j.from });
          continue;
        }
        metrics.inc("inbound_webhook_retry_ok_total");
        logEvent("inbound_webhook_retry_ok", { from: j.from });
      } catch (e) {
        j.attempts = (j.attempts || 0) + 1;
        if (j.attempts < config.inboundWebhookMaxAttempts) {
          kept.push(j);
        } else {
          logEvent("inbound_webhook_drop_max_attempts", { from: j.from, error: e?.message || String(e) });
        }
      }
    }
    inboundWebhookQueue.rewrite(kept);
    metrics.setGauge("bridge_inbound_webhook_queue_depth", kept.length);
  }

  function tickAcksAndMetrics() {
    const now = Date.now();
    updateOldestInboundGauge();
    for (const [id, rec] of state.pendingAcks.entries()) {
      if (now - rec.sentAt > config.sendAckTimeoutMs) {
        metrics.inc("outbound_ack_timeout_total");
        logEvent("outbound_ack_timeout", { id, to: rec.to, waitedMs: now - rec.sentAt });
        state.pendingAcks.delete(id);
      }
    }
    void flushInboundWebhookQueue();
  }

  function scheduleReconnect(reason) {
    if (state.shuttingDown) return;
    clearReconnectTimer();
    const circuitWait = circuit.msUntilReconnectAllowed();
    const exp = Math.min(
      config.reconnectMaxMs,
      config.reconnectInitialMs * Math.pow(2, Math.max(0, state.reconnectAttempt)),
    );
    const delayMs = Math.max(config.reconnectInitialMs, exp, circuitWait);
    logEvent("wa_reconnect_scheduled", {
      reason: String(reason || ""),
      delayMs,
      attempt: state.reconnectAttempt,
      circuitWaitMs: circuitWait,
    });
    metrics.inc("reconnect_total");
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      void reconnectNow(reason);
    }, delayMs);
  }

  async function reconnectNow(reason) {
    if (state.shuttingDown) return;
    logEvent("wa_reconnect_start", { reason: String(reason || "") });
    try {
      if (state.waClient) {
        await state.waClient.destroy().catch(() => {});
      }
    } catch (_) {
      /* ignore */
    }
    state.waClient = null;
    state.isReady = false;
    state.reconnectAttempt += 1;
    startClient();
  }

  async function postInboundWebhook(raw, headers, from) {
    const res = await axios.post(config.webhookUrl, raw, {
      headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const data = res.data;
    if (data && typeof data === "object" && data.ok === false && String(data.error || "").toLowerCase().includes("hmac")) {
      const err = new Error("webhook_hmac_rejected");
      err.response = res;
      throw err;
    }
    metrics.inc("webhook_forward_total");
    logEvent("webhook_forwarded", { from, webhookUrl: config.webhookUrl });
  }

  async function forwardToN8n(msg, text) {
    const clinicIdNum = Number.parseInt(String(config.clinicId).replace(/[^0-9]/g, ""), 10) || 1;
    const bodyObj = {
      clinic_id: clinicIdNum,
      sender: msg.from,
      from: msg.from,
      text,
      messageId: msg.id?._serialized || msg.id || "",
      timestamp: msg.timestamp,
      receivedAt: new Date().toISOString(),
    };
    const raw = JSON.stringify(bodyObj);
    const headers = { "Content-Type": "application/json" };
    if (config.webhookHmacSecret) {
      headers["X-Bridge-Signature"] = `sha256=${signPayload(config.webhookHmacSecret, raw)}`;
    }
    try {
      await postInboundWebhook(raw, headers, msg.from);
    } catch (error) {
      metrics.inc("webhook_forward_fail_total");
      console.error("[bridge] webhook forward failed:", error?.message || error);
      logEvent("webhook_forward_failed", {
        from: msg.from,
        webhookUrl: config.webhookUrl,
        error: error?.message || String(error),
      });
      if (String(error?.message || "").includes("hmac_rejected")) {
        return;
      }
      inboundWebhookQueue.enqueue({ raw, from: msg.from });
      metrics.inc("inbound_webhook_queued_total");
      logEvent("webhook_forward_queued", { from: msg.from, webhookUrl: config.webhookUrl });
    }
  }

  async function maybeTypingThenSend(chatId, sendFn) {
    const client = state.waClient;
    if (!client || !config.typingIndicatorMs) {
      return sendFn();
    }
    try {
      const chat = await client.getChatById(chatId);
      if (chat && typeof chat.sendStateTyping === "function") {
        await chat.sendStateTyping();
        await sleep(Math.min(config.typingIndicatorMs, 25_000));
      }
    } catch (_) {
      /* optional */
    }
    return sendFn();
  }

  function ensureReplyAllowed(to) {
    const lastInboundAt = state.lastInboundByChat.get(to);
    if (!lastInboundAt) {
      throw new Error("Blocked: outbound is allowed only after inbound message from this chat.");
    }
    const ageMs = Date.now() - lastInboundAt;
    const maxAgeMs = config.replyWindowHours * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      throw new Error(`Blocked: last inbound is older than ${config.replyWindowHours}h window.`);
    }
  }

  async function sendWithRetries(to, text) {
    let lastErr;
    const max = Math.max(1, config.sendMaxRetries);
    let sentMsg;
    for (let attempt = 1; attempt <= max; attempt++) {
      try {
        if (attempt === 1) {
          sentMsg = await maybeTypingThenSend(to, () => state.waClient.sendMessage(to, text));
        } else {
          metrics.inc("outbound_retry_total");
          logEvent("outbound_retry", { to, attempt, error: lastErr?.message || String(lastErr) });
          await sleep(config.sendRetryBaseMs * Math.pow(2, attempt - 2));
          sentMsg = await state.waClient.sendMessage(to, text);
        }
        return sentMsg;
      } catch (error) {
        lastErr = error;
      }
    }
    diskQueue.enqueue({ to, text, enqueuedAt: Date.now(), attempts: max });
    logEvent("outbound_failed_persisted", { to, error: lastErr?.message || String(lastErr) });
    throw lastErr;
  }

  async function drainDiskQueue() {
    const jobs = diskQueue.readAll();
    if (!jobs.length) return;
    const kept = [];
    const maxAge = 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const j of jobs) {
      if (!j.to || !j.text) continue;
      if (now - (j.enqueuedAt || 0) > maxAge) {
        logEvent("outbound_queue_drop_stale", { to: j.to });
        continue;
      }
      if (!state.isReady || !state.waClient) {
        kept.push(j);
        continue;
      }
      try {
        ensureReplyAllowed(j.to);
        const sent = await sendWithRetries(j.to, j.text);
        const id = sent?.id?._serialized;
        if (id) state.pendingAcks.set(id, { to: j.to, text: j.text, sentAt: Date.now() });
        const t = Date.now();
        state.lastOutboundByChat.set(j.to, t);
        const norm = normalizeChatId(j.to);
        if (norm) state.lastOutboundByChat.set(norm, t);
      } catch {
        j.attempts = (j.attempts || 0) + 1;
        if (j.attempts < 50) kept.push(j);
      }
    }
    diskQueue.rewrite(kept);
  }

  async function queueSend(to, text) {
    state.sendQueue = state.sendQueue.then(async () => {
      const delay = randomDelayMs(config);
      console.log(`[send] queued to=${to} delayMs=${delay}`);
      logEvent("outbound_queued", { to, delayMs: delay, text });
      await sleep(delay);
      const startedAt = Date.now();
      try {
        const sent = await sendWithRetries(to, text);
        const latencyMs = Date.now() - startedAt;
        const id = sent?.id?._serialized;
        if (id) state.pendingAcks.set(id, { to, text, sentAt: Date.now() });
        const t = Date.now();
        state.lastOutboundByChat.set(to, t);
        const norm = normalizeChatId(to);
        if (norm) state.lastOutboundByChat.set(norm, t);
        logEvent("outbound_sent", { to, text, latencyMs });
        logEvent("message_latency", { to, latencyMs, kind: "reply" });
        metrics.inc("outbound_total");
      } catch (error) {
        metrics.inc("outbound_fail_total");
        logEvent("send_failure", { to, text, error: error?.message || String(error) });
        throw error;
      }
    });
    return state.sendQueue;
  }

  async function queueDirectSend(to, text, reason) {
    state.sendQueue = state.sendQueue.then(async () => {
      const delay = randomDelayMs(config);
      console.log(`[send] direct queue to=${to} reason=${reason} delayMs=${delay}`);
      logEvent("direct_outbound_queued", { to, reason, delayMs: delay, text });
      await sleep(delay);
      const startedAt = Date.now();
      try {
        const sent = await sendWithRetries(to, text);
        const latencyMs = Date.now() - startedAt;
        const id = sent?.id?._serialized;
        if (id) state.pendingAcks.set(id, { to, text, sentAt: Date.now() });
        const t = Date.now();
        state.lastOutboundByChat.set(to, t);
        const norm = normalizeChatId(to);
        if (norm) state.lastOutboundByChat.set(norm, t);
        logEvent("direct_outbound_sent", { to, reason, text, latencyMs });
        logEvent("message_latency", { to, latencyMs, kind: reason || "direct" });
        metrics.inc("outbound_total");
      } catch (error) {
        metrics.inc("outbound_fail_total");
        logEvent("send_failure", {
          to,
          text,
          reason,
          error: error?.message || String(error),
        });
        throw error;
      }
    });
    return state.sendQueue;
  }

  function registerWhatsAppEvents(client) {
    client.on("qr", (qr) => {
      state.reconnectAttempt = 0;
      qrcode.generate(qr, { small: true });
      console.log("[bridge] scan QR from WhatsApp Linked Devices.");
    });

    client.on("ready", async () => {
      state.isReady = true;
      state.reconnectAttempt = 0;
      circuit.recordConnectSuccess();
      console.log("[bridge] WhatsApp connected.");
      try {
        await drainDiskQueue();
      } catch (e) {
        logEvent("disk_queue_drain_error", { error: e?.message || String(e) });
      }
      try {
        await flushInboundWebhookQueue();
      } catch (e) {
        logEvent("inbound_webhook_flush_error", { error: e?.message || String(e) });
      }
    });

    client.on("change_state", (s) => {
      console.log(`[bridge] state changed: ${s}`);
    });

    client.on("loading_screen", (percent, message) => {
      console.log(`[bridge] loading: ${percent}% ${message}`);
    });

    client.on("authenticated", () => {
      console.log("[bridge] WhatsApp authenticated.");
    });

    client.on("auth_failure", (msg) => {
      state.isReady = false;
      console.error("[bridge] authentication failure:", msg);
      logEvent("wa_auth_failure", { msg: String(msg) });
      circuit.recordDisconnect("auth_failure");
      scheduleReconnect("auth_failure");
    });

    client.on("disconnected", (reason) => {
      state.isReady = false;
      console.error("[bridge] disconnected:", reason);
      logEvent("wa_disconnected", { reason: String(reason) });
      circuit.recordDisconnect(String(reason));
      scheduleReconnect(`disconnected:${reason}`);
    });

    client.on("message_ack", (msg) => {
      if (!msg.fromMe) return;
      const id = msg.id?._serialized || msg.id;
      if (!id) return;
      if (state.pendingAcks.has(id)) {
        state.pendingAcks.delete(id);
        logEvent("outbound_ack", { id });
      }
    });

    client.on("message", async (msg) => {
      if (msg.fromMe) return;
      if (!config.allowGroups && msg.from.endsWith("@g.us")) return;

      const text = String(msg.body || "").trim();
      if (!text) return;
      if (shouldSkipDuplicateInbound(msg.from, text)) {
        metrics.inc("inbound_duplicate_total");
        logEvent("inbound_duplicate_skipped", { from: msg.from, text });
        return;
      }

      metrics.inc("inbound_total");
      const now = Date.now();
      state.lastInboundByChat.set(msg.from, now);
      const normalizedFrom = normalizeChatId(msg.from);
      if (normalizedFrom) {
        state.lastInboundByChat.set(normalizedFrom, now);
      }
      console.log(`[inbound] from=${msg.from} text=${text}`);
      logEvent("inbound_received", { from: msg.from, normalizedFrom, text });

      if (ctx.alertUrgentTo && isUrgentText(text, config.urgentKeywords)) {
        const urgentNotice =
          `تنبيه طوارئ\n` +
          `من: ${msg.from}\n` +
          `النص: ${text}\n` +
          `الوقت: ${new Date().toISOString()}`;
        logEvent("urgent_case_detected", { from: msg.from, text });
        try {
          await queueDirectSend(ctx.alertUrgentTo, urgentNotice, "urgent_handoff");
        } catch (error) {
          console.error("[bridge] urgent handoff failed:", error?.message || error);
          logEvent("urgent_handoff_failed", {
            to: ctx.alertUrgentTo,
            from: msg.from,
            error: error?.message || String(error),
          });
        }
      }

      await forwardToN8n(msg, text);
    });
  }

  function startClient() {
    const executablePath = resolveChromeExecutablePath(config);
    console.log(`[bridge] auth directory: ${config.waAuthDir}`);
    console.log(`[bridge] headless mode: ${config.waHeadless}`);
    const puppeteerOptions = {
      headless: config.waHeadless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };
    if (executablePath) {
      puppeteerOptions.executablePath = executablePath;
      console.log(`[bridge] browser binary: ${executablePath}`);
    } else {
      console.log("[bridge] browser binary not found. Set WA_CHROME_PATH if startup fails.");
    }

    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: config.waAuthDir }),
      takeoverOnConflict: true,
      takeoverTimeoutMs: 0,
      authTimeoutMs: config.waAuthTimeoutMs,
      puppeteer: puppeteerOptions,
    });

    state.waClient = client;
    registerWhatsAppEvents(client);
    client.initialize().catch((error) => {
      metrics.inc("init_fail_total");
      console.error("[bridge] initialize error (will retry):", error?.message || error);
      logEvent("wa_init_error", { error: error?.message || String(error) });
      state.isReady = false;
      scheduleReconnect("initialize_error");
    });
  }

  function start() {
    if (!state.heartbeatTimer) {
      state.heartbeatTimer = setInterval(tickAcksAndMetrics, 30_000);
    }
    startClient();
  }

  async function shutdown() {
    state.shuttingDown = true;
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
    clearReconnectTimer();
    try {
      await Promise.race([
        state.sendQueue.catch(() => {}),
        sleep(config.gracefulShutdownMs),
      ]);
    } catch (_) {
      /* ignore */
    }
    try {
      if (state.waClient) await state.waClient.destroy();
    } catch (_) {
      /* ignore */
    }
    state.waClient = null;
    state.isReady = false;
  }

  return {
    state,
    start,
    shutdown,
    getReady: () => state.isReady,
    getWaClient: () => state.waClient,
    ensureReplyAllowed,
    queueSend,
    queueDirectSend,
    drainDiskQueue,
  };
}

module.exports = { createWaSessionManager };
