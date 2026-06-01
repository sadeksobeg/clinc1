/**
 * Warm-up policy for newly-paired WhatsApp numbers.
 *
 * For 7 days after `paired_at`, returns a multiplier in (0, 1] that callers
 * apply to per-day / per-chat / per-minute caps, plus a reduced absolute
 * global daily cap. This significantly lowers ban risk on a fresh session.
 *
 * Day curve (UTC):
 *   day 1     → 50% caps, global = 200
 *   day 2-3   → 60%,      global = 400
 *   day 4-7   → 80%,      global = 800
 *   day >= 8  → 100%,     global = configured
 */
function dayOffset(pairedAt, now = new Date()) {
  if (!pairedAt) return null;
  const t = new Date(pairedAt).getTime();
  if (!Number.isFinite(t)) return null;
  const ms = now.getTime() - t;
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * @param {Date|string|null} pairedAt
 * @param {number} configuredGlobalDaily
 */
function computeWarmupState(pairedAt, configuredGlobalDaily) {
  const off = dayOffset(pairedAt);
  if (off == null || off >= 7) {
    return {
      active: false,
      day_index: off ?? null,
      multiplier: 1,
      effective_global_daily: configuredGlobalDaily,
      remaining_days: 0,
    };
  }
  let multiplier;
  let absoluteGlobal;
  if (off <= 0) {
    multiplier = 0.5;
    absoluteGlobal = 200;
  } else if (off <= 2) {
    multiplier = 0.6;
    absoluteGlobal = 400;
  } else {
    multiplier = 0.8;
    absoluteGlobal = 800;
  }
  return {
    active: true,
    day_index: off,
    multiplier,
    effective_global_daily: Math.min(configuredGlobalDaily, absoluteGlobal),
    remaining_days: Math.max(0, 7 - off),
  };
}

/**
 * Stateless warm-up — reads paired_at on each `check` so admin updates take effect
 * immediately. `getPairedAt` must be sync; persistence lives in DB (wa_number_state).
 */
function createWarmup(opts) {
  const getPairedAt = typeof opts.getPairedAt === "function" ? opts.getPairedAt : () => opts.pairedAt || null;
  const configuredGlobalDaily = Number(opts.configuredGlobalDaily) || 1500;

  function getState() {
    return computeWarmupState(getPairedAt(), configuredGlobalDaily);
  }

  /** Reduce a configured cap by the current warm-up multiplier. */
  function adjustCap(value) {
    const s = getState();
    return Math.max(1, Math.floor(value * s.multiplier));
  }

  return { getState, adjustCap };
}

module.exports = { computeWarmupState, createWarmup };
