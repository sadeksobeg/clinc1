/**
 * P12.4 Decision Engine Worker
 *
 * Evaluates platform_decision_rules against current platform_system_state
 * and creates platform_decisions (auto_generated=true) when matched.
 *
 * Run:
 *   npm run worker:decision-engine
 *
 * Env:
 *   DATABASE_URL
 *   DECISION_ENGINE_INTERVAL_MS (default 60000)
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("./load-ops-env.cjs");

import { getPool } from "../lib/db";
import { evalDecisionDsl, type DslNode } from "../lib/platform/decisionDsl";

function intervalMs(): number {
  const n = Number(process.env.DECISION_ENGINE_INTERVAL_MS || 60_000);
  return Number.isFinite(n) && n >= 10_000 && n <= 600_000 ? Math.floor(n) : 60_000;
}

function confidenceFromSignals(signalCount: number): number {
  if (signalCount >= 3) return 0.9;
  if (signalCount === 2) return 0.65;
  if (signalCount === 1) return 0.4;
  return 0.25;
}

function stableDedupeKey(ruleId: number, state: any): string {
  const basis = [
    `rule:${ruleId}`,
    `status:${String(state.global_status || "")}`,
    `severity:${Number(state.severity || 0)}`,
    `critical_inc:${Number(state.critical_incidents_count || 0)}`,
  ].join("|");
  // keep it deterministic and short.
  return basis.slice(0, 180);
}

async function computeOnce(): Promise<void> {
  const pool = getPool();
  const stateR = await pool.query(`SELECT * FROM platform_system_state WHERE id = 1 LIMIT 1`);
  const state = stateR.rows[0] as any | undefined;
  if (!state) return;

  const rulesR = await pool.query(
    `SELECT id, name, rule_expression, suggested_action_type, risk_level
       FROM platform_decision_rules
      WHERE enabled = TRUE
      ORDER BY id ASC`,
  );

  // Flatten metrics surface for DSL.
  const metrics: Record<string, unknown> = {
    "state.severity": Number(state.severity || 0),
    "state.global_status": String(state.global_status || ""),
    "state.blast_radius": Number(state.blast_radius || 0),
    "state.user_impact_score": Number(state.user_impact_score || 0),
    "incidents.active": Number(state.active_incidents_count || 0),
    "incidents.critical": Number(state.critical_incidents_count || 0),
    // common component statuses:
    "component.db": String((state.components || {}).db || ""),
    "component.billing": String((state.components || {}).billing || ""),
    "component.jobs": String((state.components || {}).jobs || ""),
    "component.messaging": String((state.components || {}).messaging || ""),
  };

  let suggested = 0;
  for (const r of rulesR.rows as any[]) {
    const expr = (r.rule_expression || {}) as DslNode;
    const ok = evalDecisionDsl(expr, metrics);
    if (!ok) continue;

    const dedupeKey = stableDedupeKey(Number(r.id), state);
    const existing = await pool.query(
      `SELECT id
         FROM platform_decisions
        WHERE context->>'dedupe_key' = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [dedupeKey],
    );
    if (existing.rows[0]) continue;

    const signalCount =
      Number(Number(state.severity || 0) > 0) +
      Number(Number(state.critical_incidents_count || 0) > 0) +
      Number(Number(state.blast_radius || 0) > 0);
    const conf = confidenceFromSignals(signalCount);

    await pool.query(
      `INSERT INTO platform_decisions (decision_type, trigger_source, clinic_id, incident_id, context, status, requested_by, suggested_action_type, auto_generated)
       VALUES ($1, 'system_state', NULL, NULL, $2::jsonb, 'pending', NULL, $3, TRUE)`,
      [
        String(r.name || `rule_${r.id}`),
        JSON.stringify({
          dedupe_key: dedupeKey,
          rule_id: Number(r.id),
          risk_level: String(r.risk_level || "medium"),
          confidence: conf,
          state_snapshot: {
            global_status: state.global_status,
            severity: state.severity,
            blast_radius: state.blast_radius,
            user_impact_score: state.user_impact_score,
            active_incidents_count: state.active_incidents_count,
            critical_incidents_count: state.critical_incidents_count,
            primary_cause: state.primary_cause ?? null,
          },
        }),
        String(r.suggested_action_type || ""),
      ],
    );
    suggested++;
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      component: "decision_engine_worker",
      message: "evaluated",
      rules: rulesR.rows.length,
      suggested,
    }),
  );
}

async function main(): Promise<void> {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", component: "decision_engine_worker", message: "started", interval_ms: intervalMs() }));
  for (;;) {
    await computeOnce().catch((e) => {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          component: "decision_engine_worker",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    });
    await new Promise((r) => setTimeout(r, intervalMs()));
  }
}

void main();

