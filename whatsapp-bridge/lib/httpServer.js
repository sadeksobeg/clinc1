const http = require("http");

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
    outboundGates,
    dailyCaps,
    warmup,
    broadcastDetector,
    auditWriter,
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

  // Fall back to a passthrough when not wired (back-compat for tests / older callers).
  const gates =
    outboundGates ||
    {
      applyGates: async () => ({ ok: true, jitter_ms: 0, recordSuccess: () => {} }),
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

      // Anti-ban dashboard data source (read-only). Bearer token (same as /send)
      // — exposed for ops-dashboard anti-ban panel.
      if (req.method === "GET" && req.url === "/anti-ban/status") {
        if (config.sendApiToken) {
          const token = getBearerToken(req);
          if (token !== config.sendApiToken) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
            return;
          }
        }
        const body = {
          ok: true,
          ready: getReady(),
          daily_caps: dailyCaps ? dailyCaps.snapshot() : null,
          warmup: warmup ? warmup.getState() : null,
          broadcast: broadcastDetector ? broadcastDetector.snapshot() : null,
          audit_enabled: auditWriter ? auditWriter.enabled : false,
          ts: new Date().toISOString(),
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
        return;
      }

      if (req.method !== "POST" || req.url !== "/send") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Not found" }));
        return;
      }

      if (config.requireSendApiToken && !config.sendApiToken) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "BRIDGE_SEND_API_TOKEN is required in production" }));
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

      const payload = await parseJsonBody(req);
      const correlationId = String(
        req.headers["x-correlation-id"] || req.headers["X-Correlation-Id"] || "",
      )
        .trim()
        .slice(0, 256);
      const sendKind = String(req.headers["x-send-kind"] || "patient_reply")
        .trim()
        .slice(0, 64) || "patient_reply";
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

      // Link protection: reject inline URLs unless explicitly tagged with
      // X-Send-Kind: link (drives the FSM rule "no links inside menus").
      if (/https?:\/\//i.test(text) && sendKind !== "link") {
        metrics.inc("send_blocked_total");
        logEvent("outbound_blocked", { to, reason: "link_without_explicit_kind" });
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "link_without_explicit_kind" }));
        return;
      }

      const startedAt = Date.now();
      // Unified safety stack — same gates as queueDirectSend inside the bridge.
      const gate = await gates.applyGates(to, text, { kind: sendKind });
      if (!gate.ok) {
        if (auditWriter) {
          void auditWriter.record({
            chat_id: to,
            text,
            status: "blocked",
            blocked_reason: gate.reason,
            correlation_id: correlationId || null,
            send_kind: sendKind,
          });
        }
        res.writeHead(gate.status || 429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: gate.reason }));
        return;
      }

      try {
        await queueSend(to, text);
      } catch (sendErr) {
        if (auditWriter) {
          void auditWriter.record({
            chat_id: to,
            text,
            status: "failed",
            blocked_reason: sendErr && sendErr.message ? String(sendErr.message) : "send_error",
            correlation_id: correlationId || null,
            send_kind: sendKind,
            latency_ms: Date.now() - startedAt,
          });
        }
        throw sendErr;
      }
      gate.recordSuccess();

      metrics.inc("outbound_total");
      if (correlationId) {
        logEvent("outbound_send", { to, correlation_id: correlationId, kind: sendKind });
      }
      if (auditWriter) {
        void auditWriter.record({
          chat_id: to,
          text,
          status: "sent",
          correlation_id: correlationId || null,
          send_kind: sendKind,
          latency_ms: Date.now() - startedAt,
        });
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
