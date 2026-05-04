import "server-only";
import { listTrialFunnelEventsSince, type TrialStoredEvent } from "@/lib/analytics/trialFunnelStore";

export type TrialFunnelSnapshot = {
  window: "last_24h";
  started: number;
  step_1: number;
  step_2: number;
  step_3: number;
  submitted: number;
  success: number;
  conversion_rate: number;
  drop_off: {
    step_1: number;
    step_2: number;
    step_3: number;
    submit: number;
  };
  top_errors: Array<{ field: string; count: number }>;
  rage_clicks: number;
  completion_rate: {
    step_1: number;
    step_2: number;
    step_3: number;
    submit: number;
    success: number;
  };
  p50_step_duration_ms: {
    step_1: number;
    step_2: number;
    step_3: number;
  };
  trial_to_paid: {
    paid_clinics: number;
    rate_from_success: number;
  };
  attribution: {
    utm_source_top: Array<{ source: string; count: number }>;
    cohort_top: Array<{ cohort: string; count: number }>;
    variant_top: Array<{ key: string; count: number }>;
  };
};

function uniqueSessions(events: TrialStoredEvent[], predicate: (e: TrialStoredEvent) => boolean): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (predicate(e)) out.add(e.trial_session_id);
  }
  return out;
}

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return Math.round(sorted[mid]);
}

export function buildTrialFunnelSnapshot(events: TrialStoredEvent[]): TrialFunnelSnapshot {
  const startedSet = uniqueSessions(events, (e) => e.event === "trial_started");
  const step1Set = uniqueSessions(events, (e) => e.event === "trial_step_completed" && e.step === 1);
  const step2Set = uniqueSessions(events, (e) => e.event === "trial_step_completed" && e.step === 2);
  const step3Set = uniqueSessions(events, (e) => e.event === "trial_step_completed" && e.step === 3);
  const submittedSet = uniqueSessions(events, (e) => e.event === "trial_submitted");
  const successSet = uniqueSessions(events, (e) => e.event === "trial_submit_success");
  const paidClinicSet = new Set(
    events.filter((e) => e.event === "trial_paid_conversion" && typeof e.clinic_id === "number").map((e) => Number(e.clinic_id)),
  );

  const firstValidationBySession = new Map<string, TrialStoredEvent>();
  const validationEvents = events
    .filter((e) => e.event === "trial_validation_failed")
    .sort((a, b) => a.ts_ms - b.ts_ms);
  for (const evt of validationEvents) {
    if (!firstValidationBySession.has(evt.trial_session_id)) {
      firstValidationBySession.set(evt.trial_session_id, evt);
    }
  }
  const fieldCounts = new Map<string, number>();
  for (const evt of Array.from(firstValidationBySession.values())) {
    const field = evt.fields?.[0] ?? "unknown";
    fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
  }
  const top_errors = Array.from(fieldCounts.entries())
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const rage_clicks = events.filter((e) => e.event === "trial_rage_click").length;
  const utmCount = new Map<string, number>();
  const cohortCount = new Map<string, number>();
  const variantCount = new Map<string, number>();
  for (const e of events) {
    if (e.utm_source) utmCount.set(e.utm_source, (utmCount.get(e.utm_source) ?? 0) + 1);
    if (e.cohort_key) cohortCount.set(e.cohort_key, (cohortCount.get(e.cohort_key) ?? 0) + 1);
    if (e.experiment_id || e.variant_id) {
      const key = `${e.experiment_id || "exp"}:${e.variant_id || "var"}`;
      variantCount.set(key, (variantCount.get(key) ?? 0) + 1);
    }
  }
  const step1Durations = events
    .filter((e) => e.event === "trial_step_completed" && e.step === 1 && typeof e.step_duration_ms === "number")
    .map((e) => Number(e.step_duration_ms))
    .filter((v) => Number.isFinite(v) && v > 0);
  const step2Durations = events
    .filter((e) => e.event === "trial_step_completed" && e.step === 2 && typeof e.step_duration_ms === "number")
    .map((e) => Number(e.step_duration_ms))
    .filter((v) => Number.isFinite(v) && v > 0);
  const step3Durations = events
    .filter((e) => e.event === "trial_step_completed" && e.step === 3 && typeof e.step_duration_ms === "number")
    .map((e) => Number(e.step_duration_ms))
    .filter((v) => Number.isFinite(v) && v > 0);

  const started = startedSet.size;
  const step_1 = step1Set.size;
  const step_2 = step2Set.size;
  const step_3 = step3Set.size;
  const submitted = submittedSet.size;
  const success = successSet.size;

  return {
    window: "last_24h",
    started,
    step_1,
    step_2,
    step_3,
    submitted,
    success,
    conversion_rate: percent(success, started),
    drop_off: {
      step_1: percent(Math.max(0, started - step_1), started),
      step_2: percent(Math.max(0, step_1 - step_2), step_1),
      step_3: percent(Math.max(0, step_2 - step_3), step_2),
      submit: percent(Math.max(0, step_3 - submitted), step_3),
    },
    top_errors,
    rage_clicks,
    completion_rate: {
      step_1: percent(step_1, started),
      step_2: percent(step_2, step_1),
      step_3: percent(step_3, step_2),
      submit: percent(submitted, step_3),
      success: percent(success, submitted),
    },
    p50_step_duration_ms: {
      step_1: median(step1Durations),
      step_2: median(step2Durations),
      step_3: median(step3Durations),
    },
    trial_to_paid: {
      paid_clinics: paidClinicSet.size,
      rate_from_success: percent(paidClinicSet.size, success),
    },
    attribution: {
      utm_source_top: Array.from(utmCount.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      cohort_top: Array.from(cohortCount.entries())
        .map(([cohort, count]) => ({ cohort, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      variant_top: Array.from(variantCount.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    },
  };
}

export async function getTrialFunnelSnapshotLast24h(
  nowMs = Date.now(),
  filters?: { sinceMs?: number; untilMs?: number; cohort_key?: string; experiment_id?: string; variant_id?: string; utm_source?: string },
): Promise<TrialFunnelSnapshot> {
  const dayAgoMs = filters?.sinceMs ?? nowMs - 24 * 60 * 60 * 1000;
  const events = await listTrialFunnelEventsSince(dayAgoMs, {
    untilMs: filters?.untilMs,
    cohort_key: filters?.cohort_key,
    experiment_id: filters?.experiment_id,
    variant_id: filters?.variant_id,
    utm_source: filters?.utm_source,
  });
  return buildTrialFunnelSnapshot(events);
}
