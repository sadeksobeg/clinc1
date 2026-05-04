import "server-only";
import { fetchTrialFunnelEventsSince, publishTrialFunnelEvent } from "@/lib/ops-server";

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

export async function appendTrialFunnelEvent(event: TrialStoredEvent): Promise<void> {
  await publishTrialFunnelEvent(event);
}

export async function listTrialFunnelEventsSince(
  sinceMs: number,
  filters?: { untilMs?: number; cohort_key?: string; experiment_id?: string; variant_id?: string; utm_source?: string },
): Promise<TrialStoredEvent[]> {
  const r = await fetchTrialFunnelEventsSince({
    sinceMs,
    untilMs: filters?.untilMs,
    cohort_key: filters?.cohort_key,
    experiment_id: filters?.experiment_id,
    variant_id: filters?.variant_id,
    utm_source: filters?.utm_source,
  });
  return r.ok && r.events ? r.events : [];
}
