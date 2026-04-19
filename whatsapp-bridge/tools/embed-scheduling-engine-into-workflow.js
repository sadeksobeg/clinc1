/**
 * Copies tools/scheduling-engine-n8n-code.js into n8n-workflow-whatsapp-local.json
 * Scheduling Engine node (id SchedulingEngineNode).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const workflowPath = path.join(root, "n8n-workflow-whatsapp-local.json");
const codePath = path.join(__dirname, "scheduling-engine-n8n-code.js");

const raw = fs.readFileSync(workflowPath, "utf8");
const wf = JSON.parse(raw);
const code = fs.readFileSync(codePath, "utf8").replace(/\r\n/g, "\n");
const node = wf.nodes.find((n) => n.id === "SchedulingEngineNode");
if (!node || !node.parameters) {
  console.error("SchedulingEngineNode not found");
  process.exit(1);
}
node.parameters.jsCode = code;
fs.writeFileSync(workflowPath, JSON.stringify(wf, null, 2) + "\n");
console.log("Updated Scheduling Engine jsCode in", workflowPath);
