/**
 * Extra safety limits on /send: per-chat min spacing, global per-minute cap, optional jitter before queue.
 */
function createRateSafety(opts) {
  const minMsSameChat = opts.minMsSameChat ?? 3000;
  const maxGlobalPerMinute = opts.maxGlobalPerMinute ?? 20;
  const jitterMinMs = opts.jitterMinMs ?? 800;
  const jitterMaxMs = opts.jitterMaxMs ?? 2500;

  const lastSendByChat = new Map();
  const globalMinute = [];

  function pruneGlobal(now) {
    const cutoff = now - 60_000;
    return globalMinute.filter((t) => t > cutoff);
  }

  /**
   * @returns {{ ok: true } | { ok: false, reason: string }}
   */
  function checkBeforeSend(normalizedTo) {
    const now = Date.now();
    const g = pruneGlobal(now);
    globalMinute.length = 0;
    globalMinute.push(...g);
    if (globalMinute.length >= maxGlobalPerMinute) {
      return { ok: false, reason: `safety_global_per_minute:${maxGlobalPerMinute}` };
    }
    const last = lastSendByChat.get(normalizedTo) || 0;
    if (now - last < minMsSameChat) {
      return { ok: false, reason: `safety_min_interval_ms:${minMsSameChat}` };
    }
    return { ok: true };
  }

  function recordAfterSend(normalizedTo) {
    const now = Date.now();
    globalMinute.push(now);
    lastSendByChat.set(normalizedTo, now);
  }

  /** @returns {Promise<number>} milliseconds slept */
  function sleepJitter() {
    const ms = jitterMinMs + Math.floor(Math.random() * (jitterMaxMs - jitterMinMs + 1));
    return new Promise((resolve) => setTimeout(() => resolve(ms), ms));
  }

  return { checkBeforeSend, recordAfterSend, sleepJitter };
}

module.exports = { createRateSafety };
