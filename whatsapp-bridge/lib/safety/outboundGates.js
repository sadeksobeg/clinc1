/**
 * Unified outbound safety stack.
 *
 * Combines every gate that protects the WhatsApp number into one call:
 *
 *   night-mute → rate limiter → rate safety → daily caps → broadcast circuit
 *   → reply window (optional) → jitter sleep
 *
 * Both `/send` (HTTP) and the in-bridge `queueDirectSend` (FSM menu replies)
 * must call `applyGates` so menu prompts never bypass anti-ban policy
 * (the historical hole that drove fast back-to-back menu replies).
 */
const { isNightMuted } = require("../nightMute");

function createOutboundGates(config, deps) {
  const {
    metrics,
    logEvent,
    rateLimiter,
    rateSafety,
    dailyCaps,
    broadcastDetector,
    warmup,
    ensureReplyAllowed,
  } = deps;

  function recordBlocked(reason) {
    metrics.inc("send_blocked_total");
    metrics.inc(`send_blocked_total{reason="${String(reason).replace(/[^a-z0-9_]/gi, "_").toLowerCase()}"}`);
  }

  /**
   * @param {string} to Normalized chat id (e.g. "962...@c.us")
   * @param {string} text The exact text we will queue
   * @param {{
   *   bypassRateLimit?: boolean,
   *   bypassReplyWindow?: boolean,
   *   skipJitter?: boolean,
   *   kind?: string,
   * }} [opts]
   * @returns {Promise<{ ok: true, jitter_ms: number, rl?: any, recordSuccess: () => void } | { ok: false, status: number, reason: string }>}
   */
  async function applyGates(to, text, opts) {
    const options = opts || {};
    const isStaffAlert = options.kind === "staff_alert";

    // 1) Night mute
    if (!isStaffAlert && isNightMuted({
      startHour: config.nightMuteStartHour,
      endHour: config.nightMuteEndHour,
    })) {
      recordBlocked("night_mute");
      logEvent("outbound_blocked", { to, reason: "night_mute", kind: options.kind || null });
      return { ok: false, status: 429, reason: "night_mute" };
    }

    // 2) Broadcast circuit breaker (only when detector present)
    if (broadcastDetector && !isStaffAlert) {
      const bc = broadcastDetector.checkBeforeSend();
      if (!bc.ok) {
        recordBlocked("broadcast_circuit");
        logEvent("outbound_blocked", { to, reason: bc.reason, paused_until: bc.paused_until });
        return { ok: false, status: 429, reason: bc.reason };
      }
    }

    // 3) Daily caps
    if (dailyCaps && !isStaffAlert) {
      const cap = dailyCaps.checkBeforeSend(to, text);
      if (!cap.ok) {
        recordBlocked(cap.reason);
        logEvent("outbound_blocked", { to, reason: cap.reason, limit: cap.limit, count: cap.count });
        return { ok: false, status: 429, reason: cap.reason };
      }
    }

    // 4) Hourly + per-minute per-chat
    let rl;
    if (!options.bypassRateLimit) {
      rl = rateLimiter.checkOutboundAllowed(to);
      if (!rl.ok) {
        recordBlocked("rate_limited");
        logEvent("outbound_rate_limited", { to, reason: rl.reason });
        return { ok: false, status: 429, reason: rl.reason };
      }
    }

    // 5) Per-chat min spacing + global per-minute
    const sf = rateSafety.checkBeforeSend(to);
    if (!sf.ok) {
      recordBlocked("rate_safety");
      logEvent("outbound_safety_blocked", { to, reason: sf.reason });
      return { ok: false, status: 429, reason: sf.reason };
    }

    // 6) Reply window (24h since last inbound) — skipped for staff alerts and explicit bypass
    if (!isStaffAlert && !options.bypassReplyWindow && typeof ensureReplyAllowed === "function") {
      try {
        ensureReplyAllowed(to);
      } catch (e) {
        recordBlocked("reply_window");
        const msg = e && e.message ? String(e.message) : "reply_window";
        logEvent("outbound_blocked", { to, reason: "reply_window", detail: msg });
        return { ok: false, status: 400, reason: msg };
      }
    }

    // 7) Human-paced jitter
    let jitter_ms = 0;
    if (!options.skipJitter) {
      const slept = await rateSafety.sleepJitter();
      if (typeof slept === "number" && slept > 0) {
        jitter_ms = slept;
        metrics.inc("send_safety_jitter_ms_total", slept);
      }
    }

    function recordSuccess() {
      rateSafety.recordAfterSend(to);
      if (dailyCaps && !isStaffAlert) dailyCaps.recordAfterSend(to, text);
      if (broadcastDetector && !isStaffAlert) {
        // Stamp the breaker with the (hashed) text we just emitted.
        const { hashText } = require("./dailyCaps");
        broadcastDetector.recordSend(hashText(text), to);
      }
      if (rl && !options.bypassRateLimit) {
        rateLimiter.recordOutbound(rl.chatId, rl.hourState, rl.minuteList);
      }
    }

    // Warm-up only reduces caps (consumed by dailyCaps/limit configs); it does
    // not block here. Snapshot is surfaced via metrics elsewhere.
    void warmup;

    return { ok: true, jitter_ms, rl, recordSuccess };
  }

  return { applyGates };
}

module.exports = { createOutboundGates };
