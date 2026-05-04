import { getPool } from "@/lib/db";

export type TrialStoredEvent = {
  event:
    | "trial_started"
    | "trial_step_viewed"
    | "trial_step_completed"
    | "trial_validation_failed"
    | "trial_submitted"
    | "trial_submit_failed"
    | "trial_submit_success"
    | "trial_rage_click"
    | "trial_paid_conversion";
  trial_session_id: string;
  clinic_id?: number;
  step?: number;
  fields?: string[];
  count?: number;
  step_duration_ms?: number;
  reason?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
  landing_path?: string;
  experiment_id?: string;
  variant_id?: string;
  cohort_key?: string;
  ts: string;
  ts_ms: number;
};

const MAX_READ_EVENTS = 20_000;

export async function appendTrialFunnelEvent(event: TrialStoredEvent): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO trial_funnel_events
      (event, trial_session_id, clinic_id, step, fields, count, step_duration_ms, reason, ts, ts_ms,
       utm_source, utm_medium, utm_campaign, referrer, landing_path, experiment_id, variant_id, cohort_key)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      event.event,
      event.trial_session_id,
      event.clinic_id ?? null,
      event.step ?? null,
      JSON.stringify(event.fields ?? []),
      event.count ?? null,
      event.step_duration_ms ?? null,
      event.reason ?? null,
      event.ts,
      event.ts_ms,
      event.utm_source ?? null,
      event.utm_medium ?? null,
      event.utm_campaign ?? null,
      event.referrer ?? null,
      event.landing_path ?? null,
      event.experiment_id ?? null,
      event.variant_id ?? null,
      event.cohort_key ?? null,
    ],
  );
}

export async function listTrialFunnelEventsSince(
  sinceMs: number,
  filters?: { untilMs?: number; cohortKey?: string; experimentId?: string; variantId?: string; utmSource?: string },
): Promise<TrialStoredEvent[]> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT event, trial_session_id, clinic_id, step, fields, count, step_duration_ms, reason, ts, ts_ms,
            utm_source, utm_medium, utm_campaign, referrer, landing_path, experiment_id, variant_id, cohort_key
     FROM trial_funnel_events
     WHERE ts_ms >= $1
       AND ($2::bigint IS NULL OR ts_ms <= $2::bigint)
       AND ($3::text IS NULL OR cohort_key = $3::text)
       AND ($4::text IS NULL OR experiment_id = $4::text)
       AND ($5::text IS NULL OR variant_id = $5::text)
       AND ($6::text IS NULL OR utm_source = $6::text)
     ORDER BY ts_ms ASC
     LIMIT $7`,
    [
      sinceMs,
      filters?.untilMs ?? null,
      filters?.cohortKey ?? null,
      filters?.experimentId ?? null,
      filters?.variantId ?? null,
      filters?.utmSource ?? null,
      MAX_READ_EVENTS,
    ],
  );
  return r.rows.map((row) => ({
    event: row.event,
    trial_session_id: row.trial_session_id,
    clinic_id: row.clinic_id ? Number(row.clinic_id) : undefined,
    step: row.step ?? undefined,
    fields: Array.isArray(row.fields) ? row.fields : [],
    count: row.count ?? undefined,
    step_duration_ms: row.step_duration_ms ?? undefined,
    reason: row.reason ?? undefined,
    utm_source: row.utm_source ?? undefined,
    utm_medium: row.utm_medium ?? undefined,
    utm_campaign: row.utm_campaign ?? undefined,
    referrer: row.referrer ?? undefined,
    landing_path: row.landing_path ?? undefined,
    experiment_id: row.experiment_id ?? undefined,
    variant_id: row.variant_id ?? undefined,
    cohort_key: row.cohort_key ?? undefined,
    ts: row.ts instanceof Date ? row.ts.toISOString() : String(row.ts),
    ts_ms: Number(row.ts_ms),
  })) as TrialStoredEvent[];
}
