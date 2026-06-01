const test = require("node:test");
const assert = require("node:assert/strict");
const { createHttpServer } = require("../lib/httpServer");

test("POST /send returns 503 when production requires token but none configured", async () => {
  const port = 13100 + Math.floor(Math.random() * 500);
  const config = {
    bridgePort: port,
    bridgeBindHost: "127.0.0.1",
    requireSendApiToken: true,
    sendApiToken: "",
    crmDbHost: "",
  };
  createHttpServer(config, {
    logEvent: () => {},
    metrics: { renderPrometheus: () => "", inc: () => {} },
    rateLimiter: {},
    getReady: () => true,
    getWaClient: () => ({}),
    normalizeChatId: (x) => x,
    ensureReplyAllowed: async () => {},
    queueSend: async () => {},
  });

  await new Promise((r) => setTimeout(r, 200));
  const res = await fetch(`http://127.0.0.1:${port}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: "962790000001@c.us", text: "hi" }),
  });
  assert.equal(res.status, 503);
  const j = await res.json();
  assert.match(j.error, /BRIDGE_SEND_API_TOKEN/);
});
