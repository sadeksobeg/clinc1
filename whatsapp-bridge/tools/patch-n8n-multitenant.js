/**
 * Apply multi-tenant CRM query + normalize fields to n8n workflow JSON.
 * Run: node tools/patch-n8n-multitenant.js
 */
const fs = require("fs");
const path = require("path");

const workflowPath = path.join(__dirname, "..", "n8n-workflow-whatsapp-local.json");
const sqlPath = path.join(__dirname, "crm-upsert-inbound.sql");
const j = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const newQuery = fs.readFileSync(sqlPath, "utf8").trim();

const normalize = j.nodes.find((n) => n.name === "Normalize Input");
if (normalize?.parameters?.jsCode) {
  let code = normalize.parameters.jsCode;
  if (!code.includes("workflowStartedAt")) {
    code = code.replace(
      "const body = $json.body || {};\nconst from =",
      "const body = $json.body || {};\nconst clinicIdRaw = String(body.clinic_id || '1').trim();\nconst clinic_id = Number.parseInt(clinicIdRaw.replace(/[^0-9]/g, ''), 10) || 1;\nconst workflowStartedAt = Date.now();\nconst from =",
    );
    code = code.replace(
      "    fallbackReply\n  }\n}];",
      "    fallbackReply,\n    clinic_id,\n    workflowStartedAt\n  }\n}];",
    );
    normalize.parameters.jsCode = code;
  }
}

const crm = j.nodes.find((n) => n.name === "CRM Upsert Inbound");
if (crm?.parameters) {
  crm.parameters.query = newQuery;
}

fs.writeFileSync(workflowPath, JSON.stringify(j, null, 2), "utf8");
console.log("Patched", workflowPath);
