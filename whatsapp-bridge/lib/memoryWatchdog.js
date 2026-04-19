function startMemoryWatchdog({ logEvent, metrics, intervalMs, ratioThreshold }) {
  let lastHeap = 0;
  const tick = () => {
    try {
      const mu = process.memoryUsage();
      const heapRatio = mu.heapUsed / Math.max(1, mu.heapTotal);
      if (heapRatio >= ratioThreshold) {
        metrics.inc("heap_pressure_warn_total");
        logEvent("memory_heap_pressure", {
          heapUsed: mu.heapUsed,
          heapTotal: mu.heapTotal,
          rss: mu.rss,
          ratio: Number(heapRatio.toFixed(3)),
        });
      }
      if (lastHeap && mu.heapUsed > lastHeap * 1.5 && mu.heapUsed > 200 * 1024 * 1024) {
        metrics.inc("heap_growth_spike_total");
        logEvent("memory_heap_spike", { heapUsed: mu.heapUsed, prev: lastHeap });
      }
      lastHeap = mu.heapUsed;
    } catch (e) {
      logEvent("memory_watchdog_error", { error: e?.message || String(e) });
    }
  };
  const id = setInterval(tick, intervalMs);
  tick();
  return () => clearInterval(id);
}

module.exports = { startMemoryWatchdog };
