#!/usr/bin/env node
/**
 * Prints random secret values for production .env (does not write files).
 * Usage: node scripts/generate-production-secrets.mjs
 */
import { randomBytes } from "node:crypto";

function secret(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

console.log("# Paste into .env.prod (rotate existing values; restart ops-dashboard, clinic-web, bridge, n8n)\n");
console.log(`JWT_SECRET=${secret()}`);
console.log(`SCHEDULING_SERVICE_TOKEN=${secret()}`);
console.log(`BRIDGE_SEND_API_TOKEN=${secret()}`);
console.log(`HEALTH_DEEP_TOKEN=${secret(16)}`);
console.log("\n# Then run: node scripts/production-env-audit.mjs --file .env.prod");
