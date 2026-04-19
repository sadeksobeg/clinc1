const fs = require("fs");
const path = require("path");

/**
 * Sliding-window disconnect circuit breaker + optional .wwebjs_cache repair (never touches auth dir).
 */
function createWaCircuit(config, { logEvent, metrics }) {
  const windowMs = config.waCbWindowMs;
  const threshold = config.waCbDisconnectThreshold;
  const cooldownMs = config.waCbCooldownMs;
  const timestamps = [];
  let circuitOpenUntil = 0;

  function prune(now) {
    const cut = now - windowMs;
    while (timestamps.length && timestamps[0] < cut) timestamps.shift();
  }

  function recordDisconnect(reason) {
    const now = Date.now();
    prune(now);
    timestamps.push(now);
    logEvent("wa_disconnect_recorded", {
      reason: String(reason || ""),
      countInWindow: timestamps.length,
      threshold,
    });
    if (timestamps.length >= threshold) {
      circuitOpenUntil = now + cooldownMs;
      metrics.inc("wa_circuit_open_total");
      logEvent("wa_circuit_open", { until: new Date(circuitOpenUntil).toISOString(), cooldownMs });
      if (config.waRepairCacheOnCircuit) {
        try {
          const cacheDir = path.join(process.cwd(), ".wwebjs_cache");
          if (fs.existsSync(cacheDir)) {
            fs.rmSync(cacheDir, { recursive: true, force: true });
            logEvent("wa_cache_repaired", { dir: cacheDir });
          }
        } catch (e) {
          logEvent("wa_cache_repair_failed", { error: e?.message || String(e) });
        }
      }
    }
  }

  function msUntilReconnectAllowed() {
    const now = Date.now();
    if (now >= circuitOpenUntil) return 0;
    return circuitOpenUntil - now;
  }

  function recordConnectSuccess() {
    timestamps.length = 0;
    circuitOpenUntil = 0;
  }

  return { recordDisconnect, msUntilReconnectAllowed, recordConnectSuccess };
}

module.exports = { createWaCircuit };
