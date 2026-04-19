const fs = require("fs");
const path = require("path");
const workflowPath = path.join(__dirname, "..", "whatsapp-bridge", "n8n-workflow-whatsapp-local.json");
const wf = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

if (wf.nodes.some((n) => n.name === "Flatten CRM Response")) {
  console.log("Already patched flatten");
  process.exit(0);
}

const flattenNode = {
  parameters: {
    jsCode:
      "const j = $input.first().json;\nconst b = j.body && typeof j.body === 'object' && !Array.isArray(j.body) ? j.body : {};\nreturn [{ json: { ...j, ...b } }];",
  },
  id: "FlattenCrmResponseNode",
  name: "Flatten CRM Response",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1120, 300],
};

const crmIdx = wf.nodes.findIndex((n) => n.name === "CRM Upsert Inbound");
const dupIdx = wf.nodes.findIndex((n) => n.name === "Is Duplicate?");
if (crmIdx === -1 || dupIdx === -1) throw new Error("nodes missing");
wf.nodes.splice(dupIdx, 0, flattenNode);

wf.connections["CRM Upsert Inbound"] = {
  main: [[{ node: "Flatten CRM Response", type: "main", index: 0 }]],
  error: wf.connections["CRM Upsert Inbound"]?.error || [
    [{ node: "Audit DLQ", type: "main", index: 0 }],
  ],
};
wf.connections["Flatten CRM Response"] = {
  main: [[{ node: "Is Duplicate?", type: "main", index: 0 }]],
};

// Restore simple duplicate check on flattened items
for (const n of wf.nodes) {
  if (n.name !== "Is Duplicate?") continue;
  const c = n.parameters?.conditions?.conditions?.[0];
  if (c && c.id === "is_duplicate") {
    c.leftValue = "={{$json.is_duplicate}}";
  }
}

fs.writeFileSync(workflowPath, JSON.stringify(wf, null, 2), "utf8");
console.log("Flatten CRM Response inserted");
