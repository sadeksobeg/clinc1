#!/usr/bin/env node
/**
 * Production environment audit for Clinic OS.
 *
 * Blocks launch if development-only toggles or placeholder secrets leak into
 * a production deployment. Runs either against the current process environment
 * or against one or more .env-style files.
 *
 * Usage:
 *   # Audit the current shell environment (profile = production assumed)
 *   node scripts/production-env-audit.mjs
 *
 *   # Audit specific dotenv-style files
 *   node scripts/production-env-audit.mjs --file ops-dashboard/.env.production apps/web/.env.production
 *
 *   # Force the "production" profile even when NODE_ENV is unset (CI default)
 *   CI=true node scripts/production-env-audit.mjs
 *
 * Exit codes:
 *   0 = no findings (ready for production)
 *   1 = at least one blocker finding OR internal error
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const FORBIDDEN_WHEN_PRODUCTION = [
  "SUPERADMIN_DEV_OTP",
  "NEXT_PUBLIC_SUPERADMIN_DEV_OTP",
  "NEXT_PUBLIC_SHOW_MEDICAL_QA_PANEL",
  "NEXT_PUBLIC_ENABLE_RQ_DEVTOOLS",
  "SUPERADMIN_IP_ALLOWLIST_DISABLED",
];

const REQUIRED_WHEN_PRODUCTION = [
  "DATABASE_URL",
  "JWT_SECRET",
  "OPS_DASHBOARD_URL",
  "SCHEDULING_SERVICE_TOKEN",
  "OPS_WHATSAPP_PRIMARY_HANDLER",
];

const PLACEHOLDER_PATTERNS = [
  /REPLACE_WITH_/i,
  /change-me/i,
  /mid-auto-local-dev-token/i,
  /ci-placeholder/i,
  /localhost|127\.0\.0\.1/i,
];

function parseDotenv(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`env file not found: ${filePath}`);
  }
  const out = {};
  for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
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

function auditEnv(source, env, { profile }) {
  const findings = [];
  if (profile !== "production") {
    return findings;
  }
  for (const key of FORBIDDEN_WHEN_PRODUCTION) {
    const value = env[key];
    if (value !== undefined && String(value).trim() !== "") {
      findings.push({
        severity: "blocker",
        source,
        key,
        message: `${key} must NOT be set in production (dev-only toggle).`,
      });
    }
  }
  for (const key of REQUIRED_WHEN_PRODUCTION) {
    const value = env[key];
    if (value === undefined || String(value).trim() === "") {
      findings.push({
        severity: "blocker",
        source,
        key,
        message: `${key} is required in production but is empty.`,
      });
      continue;
    }
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(String(value))) {
        findings.push({
          severity: "blocker",
          source,
          key,
          message: `${key} still uses a development/placeholder value (${pattern}).`,
        });
        break;
      }
    }
  }
  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv && nodeEnv !== "production") {
    findings.push({
      severity: "blocker",
      source,
      key: "NODE_ENV",
      message: `NODE_ENV must be 'production' for production deployments (got '${nodeEnv}').`,
    });
  }
  return findings;
}

function resolveProfile(env) {
  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  if (nodeEnv === "development") return "development";
  if (String(env.CI || "").toLowerCase() === "true") return "production";
  return "development";
}

function main() {
  const args = process.argv.slice(2);
  const files = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--file" || arg === "-f") {
      const next = args[i + 1];
      if (!next) {
        console.error("--file requires a path argument");
        process.exit(1);
      }
      files.push(next);
      i += 1;
    } else if (!arg.startsWith("-")) {
      files.push(arg);
    }
  }

  const report = { checked_at: new Date().toISOString(), sources: [] };

  if (files.length === 0) {
    const env = process.env;
    const profile = resolveProfile(env);
    const findings = auditEnv("process.env", env, { profile });
    report.sources.push({ source: "process.env", profile, findings });
  } else {
    for (const rel of files) {
      const full = resolve(rel);
      try {
        const env = parseDotenv(full);
        const profile = String(env.NODE_ENV || "").toLowerCase() === "production"
          ? "production"
          : /production|prod|live/i.test(rel)
            ? "production"
            : "development";
        const findings = auditEnv(full, env, { profile });
        report.sources.push({ source: full, profile, findings });
      } catch (err) {
        report.sources.push({
          source: full,
          profile: "unknown",
          findings: [
            { severity: "blocker", source: full, key: "__file__", message: err.message },
          ],
        });
      }
    }
  }

  const blockers = report.sources.flatMap((s) => s.findings.filter((f) => f.severity === "blocker"));
  report.ok = blockers.length === 0;

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    console.error(`\nproduction-env-audit: FAIL (${blockers.length} blocker(s))`);
    process.exit(1);
  }
  console.log("\nproduction-env-audit: PASS");
}

main();
