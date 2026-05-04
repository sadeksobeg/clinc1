/**
 * P12.4 Blast Radius Worker
 *
 * Populates platform_component_clinic_impact from simple per-clinic failure signals.
 * This is intentionally conservative: it only needs to estimate affected clinics.
 *
 * Run:
 *   npm run worker:blast-radius
 *
 * Env:
 *   DATABASE_URL
 *   BLAST_RADIUS_INTERVAL_MS (default 120000)
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("./load-ops-env.cjs");

import { getPool } from "../lib/db";

function intervalMs(): number {
  const n = Number(process.env.BLAST_RADIUS_INTERVAL_MS || 120_000);
  return Number.isFinite(n) && n >= 10_000 && n <= 900_000 ? Math.floor(n) : 120_000;
}

async function computeOnce(): Promise<void> {
  const pool = getPool();

  // Heuristic impact map:
  // - jobs: clinics that had failed_dead jobs recently
  // - messaging: clinics with blocked outbox recently
  // - billing: clinics with failed billing events recently
  const jobs = await pool.query(
    `SELECT DISTINCT clinic_id, MAX(updated_at) AS last_failure_at
       FROM system_jobs
      WHERE clinic_id IS NOT NULL
        AND status = 'failed_dead'
        AND updated_at >= NOW() - interval '24 hours'
      GROUP BY clinic_id
      LIMIT 2000`,
  );
  const outbox = await pool.query(
    `SELECT DISTINCT clinic_id, MAX(updated_at) AS last_failure_at
       FROM core_outbox
      WHERE clinic_id IS NOT NULL
        AND status = 'blocked'
        AND updated_at >= NOW() - interval '24 hours'
      GROUP BY clinic_id
      LIMIT 2000`,
  );
  const billing = await pool.query(
    `SELECT DISTINCT clinic_id, MAX(processed_at) AS last_failure_at
       FROM billing_processed_events
      WHERE clinic_id IS NOT NULL
        AND status = 'failed'
        AND processed_at >= NOW() - interval '24 hours'
      GROUP BY clinic_id
      LIMIT 2000`,
  );

  const upserts: Array<{ component: string; clinic_id: number; last_failure_at: string | null }> = [];
  for (const r of jobs.rows as any[]) upserts.push({ component: "jobs", clinic_id: Number(r.clinic_id), last_failure_at: r.last_failure_at ?? null });
  for (const r of outbox.rows as any[]) upserts.push({ component: "messaging", clinic_id: Number(r.clinic_id), last_failure_at: r.last_failure_at ?? null });
  for (const r of billing.rows as any[]) upserts.push({ component: "billing", clinic_id: Number(r.clinic_id), last_failure_at: r.last_failure_at ?? null });

  if (upserts.length) {
    // batch insert via VALUES list
    const values: string[] = [];
    const params: any[] = [];
    let i = 1;
    for (const u of upserts) {
      values.push(`($${i++}, $${i++}, $${i++})`);
      params.push(u.component, u.clinic_id, u.last_failure_at);
    }
    await pool.query(
      `INSERT INTO platform_component_clinic_impact (component, clinic_id, last_failure_at)
       VALUES ${values.join(",")}
       ON CONFLICT (component, clinic_id)
       DO UPDATE SET last_failure_at = GREATEST(platform_component_clinic_impact.last_failure_at, EXCLUDED.last_failure_at)`,
      params,
    );
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      component: "blast_radius_worker",
      message: "computed",
      impacted_rows_upserted: upserts.length,
    }),
  );
}

async function main(): Promise<void> {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", component: "blast_radius_worker", message: "started", interval_ms: intervalMs() }));
  for (;;) {
    await computeOnce().catch((e) => {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          component: "blast_radius_worker",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    });
    await new Promise((r) => setTimeout(r, intervalMs()));
  }
}

void main();

