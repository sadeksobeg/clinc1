/**
 * P12.4 Action Verification Worker
 *
 * For any platform_actions with status=success and missing platform_action_results,
 * runs best-effort verification and stores platform_action_results.
 *
 * Run:
 *   npm run worker:action-verify
 *
 * Env:
 *   DATABASE_URL
 *   ACTION_VERIFY_INTERVAL_MS (default 30000)
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("./load-ops-env.cjs");

import { getPool } from "../lib/db";
import { actionRegistry } from "../lib/platform/actionRegistry";

function intervalMs(): number {
  const n = Number(process.env.ACTION_VERIFY_INTERVAL_MS || 30_000);
  return Number.isFinite(n) && n >= 5_000 && n <= 300_000 ? Math.floor(n) : 30_000;
}

async function computeOnce(): Promise<void> {
  const pool = getPool();
  const rows = await pool.query(
    `SELECT a.id, a.action_type, a.status, a.clinic_id, a.incident_id, a.decision_id, a.payload
       FROM platform_actions a
      WHERE a.status = 'success'
        AND NOT EXISTS (SELECT 1 FROM platform_action_results r WHERE r.action_id = a.id)
      ORDER BY a.finished_at DESC NULLS LAST
      LIMIT 50`,
  );

  let verified = 0;
  for (const a of rows.rows as any[]) {
    const reg = actionRegistry[String(a.action_type || "")];
    let ok = true;
    let metricsAfter: Record<string, unknown> = {};

    try {
      if (reg?.verify) {
        const res = await reg.verify({ pool, actionRow: a });
        ok = res.ok;
        metricsAfter = res.metrics_after || {};
      } else {
        // Default: consider successful execution as verified=true (Phase 1).
        ok = true;
      }
    } catch (e) {
      ok = false;
      metricsAfter = { error: e instanceof Error ? e.message : String(e) };
    }

    await pool.query(
      `INSERT INTO platform_action_results (action_id, success, verification_status, metrics_after, verified_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (action_id) DO NOTHING`,
      [Number(a.id), ok, ok ? "verified" : "failed", JSON.stringify(metricsAfter)],
    );
    verified++;
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      component: "action_verification_worker",
      message: "verified",
      scanned: rows.rows.length,
      written: verified,
    }),
  );
}

async function main(): Promise<void> {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", component: "action_verification_worker", message: "started", interval_ms: intervalMs() }));
  for (;;) {
    await computeOnce().catch((e) => {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          component: "action_verification_worker",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    });
    await new Promise((r) => setTimeout(r, intervalMs()));
  }
}

void main();

