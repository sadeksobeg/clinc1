#!/usr/bin/env node
/**
 * Smoke: simulated inbound → process-inbound (ops). Requires running ops-dashboard.
 *
 *   OPS_DASHBOARD_URL=http://127.0.0.1:3001
 *   SCHEDULING_SERVICE_TOKEN=...
 *   E2E_CLINIC_ID=1
 *   E2E_CHAT_ID=962790000000@c.us
 */
const crypto = require("crypto");

const base = (process.env.OPS_DASHBOARD_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const token = (process.env.SCHEDULING_SERVICE_TOKEN || "").trim();
const clinicId = Number(process.env.E2E_CLINIC_ID || 1);
const chatId = (process.env.E2E_CHAT_ID || `9627${String(Date.now()).slice(-8)}@c.us`).trim();

if (!token) {
  console.error("SCHEDULING_SERVICE_TOKEN is required");
  process.exit(1);
}

async function main() {
  const body = {
    clinic_id: clinicId,
    chat_id: chatId,
    text: "مرحبا",
    message_id: `smoke-${crypto.randomUUID()}`,
    source: "e2e-smoke",
  };
  const res = await fetch(`${base}/api/internal/conversations/process-inbound`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("FAIL", res.status, json);
    process.exit(1);
  }
  console.log("PASS process-inbound", { status: res.status, ok: json.ok, keys: Object.keys(json) });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
