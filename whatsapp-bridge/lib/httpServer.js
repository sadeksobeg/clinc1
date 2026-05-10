const http = require("http");
const { isNightMuted } = require("./nightMute");

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", (error) => reject(error));
  });
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : "";
}

function createHttpServer(config, deps) {
  const {
    logEvent,
    metrics,
    rateLimiter,
    rateSafety,
    getReady,
    getWaClient,
    normalizeChatId,
    ensureReplyAllowed,
    queueSend,
  } = deps;

  const safety =
    rateSafety ||
    {
      checkBeforeSend: () => ({ ok: true }),
      recordAfterSend: () => {},
      sleepJitter: async () => 0,
    };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        const ready = getReady();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, ready }));
        return;
      }

      if (req.method === "GET" && req.url === "/ready") {
        const ready = getReady();
        res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, ready }));
        return;
      }

      if (req.method === "GET" && req.url === "/metrics") {
        const body = metrics.renderPrometheus(getReady());
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(body);
        return;
      }

      if (req.method !== "POST" || req.url !== "/send") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Not found" }));
        return;
      }

      if (config.sendApiToken) {
        const token = getBearerToken(req);
        if (token !== config.sendApiToken) {
          metrics.inc("send_auth_fail_total");
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
          return;
        }
      }

      if (
        isNightMuted({
          startHour: config.nightMuteStartHour,
          endHour: config.nightMuteEndHour,
        })
      ) {
        metrics.inc("send_night_muted_total");
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Night mute: outbound paused." }));
        return;
      }

      const payload = await parseJsonBody(req);
      const correlationId = String(
        req.headers["x-correlation-id"] || req.headers["X-Correlation-Id"] || "",
      )
        .trim()
        .slice(0, 256);
      const to = normalizeChatId(payload.to);
      const text = String(payload.text || "").trim();

      if (!getReady() || !getWaClient()) {
        throw new Error("WhatsApp client is not ready.");
      }
      if (!to || !text) {
        throw new Error("Payload requires both 'to' and 'text'.");
      }
      if (!config.allowGroups && to.endsWith("@g.us")) {
        throw new Error("Blocked: group sends are disabled.");
      }

      const rl = rateLimiter.checkOutboundAllowed(to);
      if (!rl.ok) {
        metrics.inc("send_rate_limited_total");
        logEvent("outbound_rate_limited", { to, reason: rl.reason });
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: rl.reason }));
        return;
      }

      const sf = safety.checkBeforeSend(to);
      if (!sf.ok) {
        metrics.inc("send_safety_blocked_total");
        logEvent("outbound_safety_blocked", { to, reason: sf.reason });
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: sf.reason }));
        return;
      }

      const jitterMs = await safety.sleepJitter();
      if (typeof jitterMs === "number" && jitterMs > 0) {
        metrics.inc("send_safety_jitter_ms_total", jitterMs);
      }
      ensureReplyAllowed(to);
      await queueSend(to, text);
      safety.recordAfterSend(to);
      rateLimiter.recordOutbound(rl.chatId, rl.hourState, rl.minuteList);

      metrics.inc("outbound_total");
      if (correlationId) {
        logEvent("outbound_send", { to, correlation_id: correlationId });
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      metrics.inc("outbound_fail_total");
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  });

  server.listen(config.bridgePort, config.bridgeBindHost, () => {
    const host = config.bridgeBindHost;
    console.log(
      `[bridge] outbound endpoint ready on http://${host}:${config.bridgePort}/send`,
    );
    console.log(
      `[bridge] health http://${host}:${config.bridgePort}/health | ready http://${host}:${config.bridgePort}/ready | metrics http://${host}:${config.bridgePort}/metrics`,
    );
    logEvent("bridge_started", {
      bridgePort: config.bridgePort,
      bridgeBindHost: host,
      webhookUrl: config.webhookUrl,
      clinicId: config.clinicId,
      replyWindowHours: config.replyWindowHours,
      inboundDedupWindowMs: config.inboundDedupWindowMs,
      urgentAlertTo: config.alertUrgentTo || null,
      webhookHmacEnabled: Boolean(config.webhookHmacSecret),
      inboundWebhookQueueFile: config.inboundWebhookQueueFile,
      sendAuthEnabled: Boolean(config.sendApiToken),
      crmConfigured: Boolean(config.crmDbHost && config.crmDbName && config.crmDbUser),
      crmConfigPreview: config.crmDbHost
        ? {
            host: config.crmDbHost,
            port: config.crmDbPort,
            database: config.crmDbName || null,
            user: config.crmDbUser || null,
            ssl: config.crmDbSsl,
          }
        : null,
      aiConfig: {
        enabled: config.aiEnabled,
        provider: config.aiProvider,
        model: config.aiModel,
        allowReplyDrafts: config.aiAllowReplyDrafts,
        maxReplyChars: config.aiMaxReplyChars,
        timeoutMs: config.aiTimeoutMs,
        failOpenToRules: config.aiFailOpenToRules,
        circuitBreakerWindowMs: config.aiCircuitBreakerWindowMs,
        circuitBreakerMaxFailures: config.aiCircuitBreakerMaxFailures,
      },
    });
  });

  return { server, parseJsonBody };
}

module.exports = { createHttpServer, parseJsonBody };
