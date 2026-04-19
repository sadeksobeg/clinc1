/**
 * Applies plan items to whatsapp-bridge/n8n-workflow-whatsapp-local.json:
 * - Verify Webhook HMAC (Code) + IF + reject Set
 * - Replace CRM Upsert Inbound Postgres with HTTP to ops-dashboard /api/internal/crm/inbound-ingest
 * - BRIDGE_SEND_URL / OPS_DASHBOARD_URL expressions on HTTP nodes
 */
const fs = require("fs");
const path = require("path");

const workflowPath = path.join(__dirname, "..", "whatsapp-bridge", "n8n-workflow-whatsapp-local.json");
const wf = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

const VERIFY_JS = `const crypto = require('crypto');
function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a).trim(), 'hex');
    const bb = Buffer.from(String(b).trim(), 'hex');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
const secret = (process.env.N8N_WEBHOOK_HMAC_SECRET || '').trim();
const item = $input.first().json;
const headers = item.headers || {};
const sigHeader = headers['x-bridge-signature'] || headers['X-Bridge-Signature'] || '';
const m = /^sha256=(.+)$/i.exec(String(sigHeader));
const digestFromHeader = m ? m[1].trim() : '';
const body = item.body || {};
const clinic_id = typeof body.clinic_id === 'number' ? body.clinic_id : (Number.parseInt(String(body.clinic_id || '1').replace(/[^0-9]/g, ''), 10) || 1);
const sender = String(body.sender || body.from || '').trim();
const from = String(body.from || body.sender || '').trim();
const text = String(body.text || '');
const messageId = String(body.messageId || '');
const timestamp = body.timestamp;
const receivedAt = String(body.receivedAt || '');
const canonicalObj = { clinic_id, sender: sender || from, from: from || sender, text, messageId, timestamp, receivedAt };
const raw = JSON.stringify(canonicalObj);
let hmacOk = true;
if (secret) {
  const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  hmacOk = timingSafeEqualHex(expected, digestFromHeader);
}
return [{ json: { ...item, hmacOk, hmacChecked: Boolean(secret) } }];`;

const verifyNode = {
  parameters: { jsCode: VERIFY_JS },
  id: "VerifyWebhookHmacNode",
  name: "Verify Webhook HMAC",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [340, 300],
};

const hmacIfNode = {
  parameters: {
    conditions: {
      options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [
        {
          id: "hmac_ok",
          leftValue: "={{$json.hmacOk}}",
          rightValue: true,
          operator: { type: "boolean", operation: "true", singleValue: true },
        },
      ],
      combinator: "and",
    },
  },
  id: "HmacOkGateNode",
  name: "HMAC OK?",
  type: "n8n-nodes-base.if",
  typeVersion: 2.2,
  position: [460, 300],
};

const hmacRejectNode = {
  parameters: {
    assignments: {
      assignments: [
        { name: "ok", value: false, type: "boolean" },
        { name: "error", value: "hmac_rejected", type: "string" },
        { name: "sent", value: false, type: "boolean" },
      ],
    },
    includeOtherFields: false,
    options: {},
  },
  id: "RespondHmacRejectedNode",
  name: "Respond HMAC Rejected",
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  position: [460, 520],
};

const crmUrlExpr =
  "={{ (($env.OPS_DASHBOARD_URL || 'http://host.docker.internal:3001').replace(/\\/$/, '')) + '/api/internal/crm/inbound-ingest' }}";
const bridgeUrlExpr =
  "={{ (($env.BRIDGE_SEND_URL || 'http://host.docker.internal:3100').replace(/\\/$/, '')) + '/send' }}";

const nodes = [...wf.nodes];
const crmIdx = nodes.findIndex((n) => n.name === "CRM Upsert Inbound");
if (crmIdx === -1) throw new Error("CRM Upsert Inbound node not found");
const prevCrm = nodes[crmIdx];
const crmHttpNode = {
  parameters: {
    method: "POST",
    url: crmUrlExpr,
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ JSON.stringify({ clinic_id: $json.clinic_id, from: $json.from, text: $json.text, messageId: $json.messageId, dedupeHash: $json.dedupeHash, ruleIntent: $json.ruleIntent, rulePriority: $json.rulePriority, ruleHandoff: $json.ruleHandoff, fallbackReply: $json.fallbackReply, outsideHours: $json.outsideHours, receivedAt: $json.receivedAt, alertTo: $json.alertTo, workflowStartedAt: $json.workflowStartedAt }) }}",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "Content-Type", value: "application/json" },
        { name: "Authorization", value: "=Bearer {{ $env.SCHEDULING_SERVICE_TOKEN }}" },
      ],
    },
    options: { timeout: 60000 },
  },
  id: prevCrm.id,
  name: "CRM Upsert Inbound",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: prevCrm.position || [940, 300],
  onError: "continueErrorOutput",
};
nodes[crmIdx] = crmHttpNode;

if (!nodes.some((n) => n.name === "Verify Webhook HMAC")) {
  const normIdx = nodes.findIndex((n) => n.name === "Normalize Input");
  if (normIdx === -1) throw new Error("Normalize Input not found");
  nodes.splice(normIdx, 0, verifyNode, hmacIfNode, hmacRejectNode);
}

wf.nodes = nodes;

for (const n of wf.nodes) {
  if (n.type !== "n8n-nodes-base.httpRequest") continue;
  if (n.name === "Send Urgent Alert" || n.name === "Send Reply via Bridge") {
    n.parameters = n.parameters || {};
    n.parameters.url = bridgeUrlExpr;
  }
}

wf.connections = wf.connections || {};
wf.connections["Webhook Inbound"] = {
  main: [[{ node: "Verify Webhook HMAC", type: "main", index: 0 }]],
};
wf.connections["Verify Webhook HMAC"] = {
  main: [[{ node: "HMAC OK?", type: "main", index: 0 }]],
};
wf.connections["HMAC OK?"] = {
  main: [
    [{ node: "Normalize Input", type: "main", index: 0 }],
    [{ node: "Respond HMAC Rejected", type: "main", index: 0 }],
  ],
};

fs.writeFileSync(workflowPath, JSON.stringify(wf, null, 2), "utf8");
console.log("Patched:", workflowPath);
