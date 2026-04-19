/**
 * In-process product counters for ops-dashboard (cron + API paths).
 * Not a replacement for Prometheus on the bridge; complements structured logs.
 */

type CounterKey =
  | "process_inbound_total"
  | "process_inbound_error_total"
  | "process_inbound_duplicate_total"
  | "process_inbound_booking_consumed_total"
  | "bridge_send_blocked_policy_total"
  | "outbox_drain_sent_total"
  | "outbox_drain_blocked_total"
  | "outbox_drain_failed_total";

const counters: Record<CounterKey, number> = {
  process_inbound_total: 0,
  process_inbound_error_total: 0,
  process_inbound_duplicate_total: 0,
  process_inbound_booking_consumed_total: 0,
  bridge_send_blocked_policy_total: 0,
  outbox_drain_sent_total: 0,
  outbox_drain_blocked_total: 0,
  outbox_drain_failed_total: 0,
};

let latencySumMs = 0;
let latencyCount = 0;

export function incProductMetric(key: CounterKey, n = 1): void {
  counters[key] = (counters[key] || 0) + n;
}

export function observeProcessInboundLatencyMs(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  latencySumMs += ms;
  latencyCount += 1;
}

export function getProductMetricsSnapshot(): Record<string, number> {
  const avg = latencyCount ? latencySumMs / latencyCount : 0;
  return {
    ...counters,
    process_inbound_latency_avg_ms: Math.round(avg * 100) / 100,
    process_inbound_latency_sample_count: latencyCount,
  };
}

export function resetProductMetricsForTests(): void {
  (Object.keys(counters) as CounterKey[]).forEach((k) => {
    counters[k] = 0;
  });
  latencySumMs = 0;
  latencyCount = 0;
}
