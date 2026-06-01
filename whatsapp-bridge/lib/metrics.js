/**
 * Simple in-process counters + gauges for GET /metrics (Prometheus exposition format).
 */
function createMetrics() {
  const c = {
    inbound_total: 0,
    inbound_duplicate_total: 0,
    outbound_total: 0,
    outbound_fail_total: 0,
    outbound_retry_total: 0,
    webhook_forward_total: 0,
    webhook_forward_fail_total: 0,
    inbound_webhook_queued_total: 0,
    inbound_webhook_retry_ok_total: 0,
    send_rate_limited_total: 0,
    send_night_muted_total: 0,
    send_auth_fail_total: 0,
    send_safety_blocked_total: 0,
    send_safety_jitter_ms_total: 0,
    send_blocked_total: 0,
    broadcast_circuit_trips_total: 0,
    audit_ok_total: 0,
    audit_fail_total: 0,
    reconnect_total: 0,
    init_fail_total: 0,
    wa_circuit_open_total: 0,
    heap_pressure_warn_total: 0,
    heap_growth_spike_total: 0,
    outbound_ack_timeout_total: 0,
  };

  // Free-form counters (used for labeled blocked reasons, etc.).
  const dynamicCounters = new Map();

  const gauges = {
    bridge_oldest_inbound_reply_seconds: 0,
    bridge_inbound_webhook_queue_depth: 0,
  };

  /** Provider for live gauges (warmup, daily caps, broadcast). Wire via setGaugeProvider. */
  let gaugeProvider = null;

  function inc(key, n = 1) {
    // Labeled keys like 'send_blocked_total{reason="..."}' go to dynamicCounters
    // and are rendered separately so the Prometheus format stays valid.
    if (typeof key === "string" && key.includes("{")) {
      dynamicCounters.set(key, (dynamicCounters.get(key) || 0) + n);
      return;
    }
    c[key] = (c[key] || 0) + n;
  }

  function setGauge(name, value) {
    gauges[name] = Number(value) || 0;
  }

  function setGaugeProvider(fn) {
    gaugeProvider = typeof fn === "function" ? fn : null;
  }

  function renderPrometheus(ready) {
    const lines = [
      "# HELP bridge_ready WhatsApp client connected (1) or not (0)",
      "# TYPE bridge_ready gauge",
      `bridge_ready ${ready ? 1 : 0}`,
      "# HELP bridge_oldest_inbound_reply_seconds Est. oldest chat waiting for our outbound (heuristic)",
      "# TYPE bridge_oldest_inbound_reply_seconds gauge",
      `bridge_oldest_inbound_reply_seconds ${gauges.bridge_oldest_inbound_reply_seconds}`,
      "# HELP bridge_inbound_webhook_queue_depth Pending inbound webhook retries (NDJSON queue)",
      "# TYPE bridge_inbound_webhook_queue_depth gauge",
      `bridge_inbound_webhook_queue_depth ${gauges.bridge_inbound_webhook_queue_depth}`,
      "# HELP bridge_inbound_total Inbound messages accepted",
      "# TYPE bridge_inbound_total counter",
      `bridge_inbound_total ${c.inbound_total}`,
      "# HELP bridge_inbound_duplicate_total Deduplicated inbound skipped",
      "# TYPE bridge_inbound_duplicate_total counter",
      `bridge_inbound_duplicate_total ${c.inbound_duplicate_total}`,
      "# HELP bridge_outbound_total Outbound messages sent",
      "# TYPE bridge_outbound_total counter",
      `bridge_outbound_total ${c.outbound_total}`,
      "# HELP bridge_outbound_fail_total Outbound send failures",
      "# TYPE bridge_outbound_fail_total counter",
      `bridge_outbound_fail_total ${c.outbound_fail_total}`,
      "# HELP bridge_outbound_retry_total Outbound send retries",
      "# TYPE bridge_outbound_retry_total counter",
      `bridge_outbound_retry_total ${c.outbound_retry_total}`,
      "# HELP bridge_outbound_ack_timeout_total Outbound ack timeouts",
      "# TYPE bridge_outbound_ack_timeout_total counter",
      `bridge_outbound_ack_timeout_total ${c.outbound_ack_timeout_total}`,
      "# HELP bridge_webhook_forward_total Webhooks posted to n8n",
      "# TYPE bridge_webhook_forward_total counter",
      `bridge_webhook_forward_total ${c.webhook_forward_total}`,
      "# HELP bridge_webhook_forward_fail_total Webhook POST failures",
      "# TYPE bridge_webhook_forward_fail_total counter",
      `bridge_webhook_forward_fail_total ${c.webhook_forward_fail_total}`,
      "# HELP bridge_inbound_webhook_queued_total Inbound webhooks written to disk retry queue",
      "# TYPE bridge_inbound_webhook_queued_total counter",
      `bridge_inbound_webhook_queued_total ${c.inbound_webhook_queued_total}`,
      "# HELP bridge_inbound_webhook_retry_ok_total Inbound webhook retries that succeeded",
      "# TYPE bridge_inbound_webhook_retry_ok_total counter",
      `bridge_inbound_webhook_retry_ok_total ${c.inbound_webhook_retry_ok_total}`,
      "# HELP bridge_send_rate_limited_total /send blocked by rate limit",
      "# TYPE bridge_send_rate_limited_total counter",
      `bridge_send_rate_limited_total ${c.send_rate_limited_total}`,
      "# HELP bridge_send_night_muted_total /send blocked by night mute",
      "# TYPE bridge_send_night_muted_total counter",
      `bridge_send_night_muted_total ${c.send_night_muted_total}`,
      "# HELP bridge_send_auth_fail_total /send rejected (bad auth)",
      "# TYPE bridge_send_auth_fail_total counter",
      `bridge_send_auth_fail_total ${c.send_auth_fail_total}`,
      "# HELP bridge_send_safety_blocked_total /send blocked by rateSafety layer",
      "# TYPE bridge_send_safety_blocked_total counter",
      `bridge_send_safety_blocked_total ${c.send_safety_blocked_total}`,
      "# HELP bridge_send_safety_jitter_ms_total Cumulative milliseconds spent in pre-send jitter (rateSafety)",
      "# TYPE bridge_send_safety_jitter_ms_total counter",
      `bridge_send_safety_jitter_ms_total ${c.send_safety_jitter_ms_total}`,
      "# HELP bridge_reconnect_total WhatsApp reconnect attempts",
      "# TYPE bridge_reconnect_total counter",
      `bridge_reconnect_total ${c.reconnect_total}`,
      "# HELP bridge_init_fail_total Initialize failures (non-fatal if recovered)",
      "# TYPE bridge_init_fail_total counter",
      `bridge_init_fail_total ${c.init_fail_total}`,
      "# HELP bridge_wa_circuit_open_total WA disconnect circuit opened",
      "# TYPE bridge_wa_circuit_open_total counter",
      `bridge_wa_circuit_open_total ${c.wa_circuit_open_total}`,
      "# HELP bridge_heap_pressure_warn_total Memory watchdog heap pressure warns",
      "# TYPE bridge_heap_pressure_warn_total counter",
      `bridge_heap_pressure_warn_total ${c.heap_pressure_warn_total}`,
      "# HELP bridge_heap_growth_spike_total Memory watchdog heap spike events",
      "# TYPE bridge_heap_growth_spike_total counter",
      `bridge_heap_growth_spike_total ${c.heap_growth_spike_total}`,
      // ── Anti-ban ───────────────────────────────────────────────────────
      "# HELP bridge_send_blocked_total Outbound blocked by any safety gate (broadcast, daily caps, rate, night)",
      "# TYPE bridge_send_blocked_total counter",
      `bridge_send_blocked_total ${c.send_blocked_total}`,
      "# HELP bridge_broadcast_circuit_trips_total Broadcast-pattern circuit breaker trips",
      "# TYPE bridge_broadcast_circuit_trips_total counter",
      `bridge_broadcast_circuit_trips_total ${c.broadcast_circuit_trips_total}`,
      "# HELP bridge_audit_ok_total wa_send_audit rows successfully recorded",
      "# TYPE bridge_audit_ok_total counter",
      `bridge_audit_ok_total ${c.audit_ok_total}`,
      "# HELP bridge_audit_fail_total wa_send_audit POSTs that failed (audit is lossy by design)",
      "# TYPE bridge_audit_fail_total counter",
      `bridge_audit_fail_total ${c.audit_fail_total}`,
    ];
    // Labeled blocked-reason counters (e.g. send_blocked_total{reason="rate_safety"} N)
    for (const [k, v] of dynamicCounters.entries()) {
      lines.push(`bridge_${k} ${v}`);
    }
    // Live gauges from anti-ban modules (computed at scrape time).
    if (gaugeProvider) {
      try {
        const g = gaugeProvider() || {};
        if (typeof g.warmup_remaining_days === "number") {
          lines.push("# HELP bridge_wa_warmup_remaining_days Days remaining in warm-up policy");
          lines.push("# TYPE bridge_wa_warmup_remaining_days gauge");
          lines.push(`bridge_wa_warmup_remaining_days ${g.warmup_remaining_days}`);
        }
        if (typeof g.daily_cap_global_usage === "number") {
          lines.push("# HELP bridge_wa_daily_cap_global_usage Global daily-cap usage (0..1)");
          lines.push("# TYPE bridge_wa_daily_cap_global_usage gauge");
          lines.push(`bridge_wa_daily_cap_global_usage ${g.daily_cap_global_usage}`);
        }
        if (typeof g.broadcast_circuit_paused === "number") {
          lines.push("# HELP bridge_wa_broadcast_circuit_paused 1 = broadcast circuit currently paused, 0 = open");
          lines.push("# TYPE bridge_wa_broadcast_circuit_paused gauge");
          lines.push(`bridge_wa_broadcast_circuit_paused ${g.broadcast_circuit_paused}`);
        }
      } catch {
        /* ignore — keep base metrics rendering */
      }
    }
    return `${lines.join("\n")}\n`;
  }

  return {
    inc,
    setGauge,
    setGaugeProvider,
    renderPrometheus,
    snapshot: () => ({ ...c, dynamic: Object.fromEntries(dynamicCounters), gauges: { ...gauges } }),
  };
}

module.exports = { createMetrics };
