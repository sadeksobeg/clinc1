export type TrialFunnelEventName =
  | "trial_started"
  | "trial_step_viewed"
  | "trial_step_completed"
  | "trial_validation_failed"
  | "trial_submitted"
  | "trial_submit_failed"
  | "trial_submit_success"
  | "trial_rage_click"
  | "trial_paid_conversion";

export type TrialFunnelEventPayload = {
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
};

const STORAGE_KEY = "trial_session_id";
const ATTR_STORAGE_KEY = "trial_attr_v1";

function newSessionId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `trial_${Date.now()}_${random}`;
}

export function getTrialSessionId(): string {
  if (typeof window === "undefined") return "trial_ssr";
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const next = newSessionId();
  window.localStorage.setItem(STORAGE_KEY, next);
  return next;
}

function readAttribution(): Partial<TrialFunnelEventPayload> {
  if (typeof window === "undefined") return {};
  try {
    const u = new URL(window.location.href);
    const fromQuery = {
      utm_source: u.searchParams.get("utm_source") || undefined,
      utm_medium: u.searchParams.get("utm_medium") || undefined,
      utm_campaign: u.searchParams.get("utm_campaign") || undefined,
      experiment_id: u.searchParams.get("exp") || undefined,
      variant_id: u.searchParams.get("var") || undefined,
      landing_path: `${u.pathname}${u.search}`,
      referrer: document.referrer || undefined,
    };
    const cachedRaw = window.localStorage.getItem(ATTR_STORAGE_KEY);
    const cached = cachedRaw ? (JSON.parse(cachedRaw) as Partial<TrialFunnelEventPayload>) : {};
    const merged = { ...cached, ...fromQuery };
    if (!merged.cohort_key) {
      const src = merged.utm_source || "direct";
      const camp = merged.utm_campaign || "none";
      merged.cohort_key = `${src}:${camp}`;
    }
    window.localStorage.setItem(ATTR_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return {};
  }
}

export async function trackTrialEvent(
  event: TrialFunnelEventName,
  payload: TrialFunnelEventPayload,
): Promise<void> {
  try {
    await fetch("/api/analytics/trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        ...readAttribution(),
        ...payload,
        ts: new Date().toISOString(),
      }),
      keepalive: true,
    });
  } catch {
    // Best effort tracking; do not block UX.
  }
}
