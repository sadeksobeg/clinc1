/**
 * Smoke test for critical pre-launch flows:
 * 1) trial signup
 * 2) lead form
 * 3) whatsapp trigger (n8n webhook)
 * 4) alerts flow endpoint
 *
 * Usage:
 *   $env:WEB_BASE_URL="http://127.0.0.1:3000"
 *   $env:N8N_WEBHOOK_URL="http://127.0.0.1:5678/webhook/whatsapp"
 *   $env:N8N_WEBHOOK_HMAC_SECRET="..."
 *   $env:ALERTS_FLOW_TEST_URL="https://n8n.example.com/webhook/ops-alert"
 *   node scripts/n8n-critical-flows-smoke.cjs
 */
const crypto = require("node:crypto");

const webBase = (process.env.WEB_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const n8nWebhookUrl = (process.env.N8N_WEBHOOK_URL || "http://127.0.0.1:5678/webhook/whatsapp").trim();
const webhookSecret = (process.env.N8N_WEBHOOK_HMAC_SECRET || "").trim();
const alertsUrl = (process.env.ALERTS_FLOW_TEST_URL || "").trim();
const alertsBearer = (process.env.ALERTS_FLOW_TEST_BEARER || "").trim();

async function postJson(url, body, headers) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, body: json };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: { error: e instanceof Error ? e.message : "fetch_failed", url },
    };
  }
}

function signCanonicalPayload(body) {
  const canonical = {
    clinic_id: body.clinic_id,
    sender: body.sender,
    from: body.from,
    text: body.text,
    messageId: body.messageId,
    timestamp: body.timestamp,
    receivedAt: body.receivedAt,
  };
  const raw = JSON.stringify(canonical);
  const digest = crypto.createHmac("sha256", webhookSecret).update(raw, "utf8").digest("hex");
  return `sha256=${digest}`;
}

async function main() {
  const report = { ok: true, checks: [] };
  const unique = Date.now().toString(36);

  const trialPayload = {
    clinicName: `Pilot Clinic ${unique}`,
    ownerName: "Launch Owner",
    whatsapp: "963955500011@c.us",
    city: "Damascus",
    specialty: "general",
    doctorsCount: 1,
    email: `launch.${unique}@example.com`,
    password: "Launch!2026Strong",
    confirmPassword: "Launch!2026Strong",
  };
  const trial = await postJson(`${webBase}/api/trial/signup`, trialPayload);
  report.checks.push({ name: "trial_signup", ...trial });

  const lead = await postJson(`${webBase}/api/leads/demo`, {
    clinicName: `Lead Clinic ${unique}`,
    size: "5-10",
    need: "Pilot request smoke test",
    preferredTime: "10:00",
  });
  report.checks.push({ name: "lead_form", ...lead });

  const inbound = {
    clinic_id: 1,
    sender: "963955500022@c.us",
    from: "963955500022@c.us",
    text: "مرحبا، أريد حجز موعد",
    messageId: `smoke-${unique}`,
    timestamp: Date.now(),
    receivedAt: new Date().toISOString(),
  };
  const inboundHeaders = webhookSecret ? { "X-Bridge-Signature": signCanonicalPayload(inbound) } : undefined;
  const wa = await postJson(n8nWebhookUrl, inbound, inboundHeaders);
  report.checks.push({ name: "whatsapp_trigger", ...wa });

  if (!alertsUrl) {
    report.checks.push({
      name: "alerts_flow",
      ok: false,
      status: 0,
      body: { error: "ALERTS_FLOW_TEST_URL is required" },
    });
  } else {
    const alert = await postJson(
      alertsUrl,
      {
        type: "launch_smoke",
        severity: "info",
        source: "ops-dashboard/scripts/n8n-critical-flows-smoke.cjs",
        message: `n8n alerts smoke ${unique}`,
        ts: new Date().toISOString(),
      },
      alertsBearer ? { Authorization: `Bearer ${alertsBearer}` } : undefined,
    );
    report.checks.push({ name: "alerts_flow", ...alert });
  }

  report.ok = report.checks.every((c) => c.ok);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e?.message || String(e) }, null, 2));
  process.exit(1);
});
