/**
 * P7 go-live gate: runs smoke, alerts, ops validation, data integrity, optional ops-dashboard tests.
 *
 *   node scripts/p7-go-live-gate.mjs
 *
 * Env:
 *   SKIP_OPS_DASHBOARD_TESTS=true  — skip `npm test` under ops-dashboard (faster CI)
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Same DATABASE_URL defaults as apply-scheduling-sql / ops-dashboard CLI */
createRequire(import.meta.url)(resolve(repoRoot, "ops-dashboard/scripts/load-ops-env.cjs"));

function run(title, cmd, args, opts = {}) {
  console.log(`\n=== ${title} ===`);
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || repoRoot,
    encoding: "utf-8",
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  const ok = r.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} - ${title} (exit ${r.status})`);
  return ok;
}

const report = { started_at: new Date().toISOString(), steps: [] };

function push(name, pass) {
  report.steps.push({ name, pass });
  return pass;
}

const skipTests = String(process.env.SKIP_OPS_DASHBOARD_TESTS || "").toLowerCase() === "true";

push("smoke:p5", run("smoke:p5", "npm", ["run", "smoke:p5"]));
push(
  "ops:alerts:check",
  run("ops:alerts:check", "npm", ["run", "ops:alerts:check"], { cwd: resolve(repoRoot, "ops-dashboard") }),
);
push("validate:p6-ops", run("validate:p6-ops", "npm", ["run", "validate:p6-ops"]));
push(
  "data-integrity-check",
  run("data-integrity-check", "node", ["scripts/data-integrity-check.cjs"], { cwd: resolve(repoRoot, "ops-dashboard") }),
);

if (!skipTests) {
  push("ops-dashboard unit tests", run("ops-dashboard tests", "npm", ["test"], { cwd: resolve(repoRoot, "ops-dashboard") }));
} else {
  push("ops-dashboard unit tests", true);
  console.log("\n=== ops-dashboard unit tests ===\nSKIP (SKIP_OPS_DASHBOARD_TESTS=true)");
}

report.ok = report.steps.every((s) => s.pass);
report.finished_at = new Date().toISOString();

const outPath = resolve(repoRoot, "p7-go-live-report.json");
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
console.log(`\nReport written: ${outPath}`);
console.log(`\nP7 Go-Live Gate: ${report.ok ? "GO" : "NO-GO"}`);

process.exit(report.ok ? 0 : 1);
