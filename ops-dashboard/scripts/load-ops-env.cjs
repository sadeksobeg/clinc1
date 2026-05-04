/**
 * Loads ops-dashboard/.env then .env.local into process.env when keys are unset.
 * Node CLI scripts do not load .env.local automatically (Next.js does).
 */
const fs = require("fs");
const path = require("path");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const root = path.resolve(__dirname, "..");
const merged = {
  ...parseEnvFile(path.join(root, ".env")),
  ...parseEnvFile(path.join(root, ".env.local")),
};
for (const [k, v] of Object.entries(merged)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
