/**
 * Per-chat hourly reply cap + per-minute burst cap for outbound /send.
 */
function createRateLimiter({ maxPerHour, maxPerMinute }) {
  const hourMap = new Map(); // chatId -> { hourKey, count }
  const minuteWindows = new Map(); // chatId -> number[] timestamps ms

  function currentHourKey() {
    return Math.floor(Date.now() / (60 * 60 * 1000));
  }

  function pruneMinute(tsList, now) {
    const cutoff = now - 60_000;
    return tsList.filter((t) => t > cutoff);
  }

  /**
   * @returns {{ ok: true } | { ok: false, reason: string }}
   */
  function checkOutboundAllowed(chatId) {
    const now = Date.now();
    const hk = currentHourKey();
    let h = hourMap.get(chatId);
    if (!h || h.hourKey !== hk) {
      h = { hourKey: hk, count: 0 };
      hourMap.set(chatId, h);
    }
    if (h.count >= maxPerHour) {
      return { ok: false, reason: `hourly_limit:${maxPerHour}`, chatId };
    }

    let minuteList = minuteWindows.get(chatId) || [];
    minuteList = pruneMinute(minuteList, now);
    if (minuteList.length >= maxPerMinute) {
      return { ok: false, reason: `burst_limit:${maxPerMinute}_per_minute`, chatId };
    }

    return { ok: true, hourState: h, minuteList, chatId };
  }

  function recordOutbound(chatId, hourState, minuteList) {
    hourState.count += 1;
    const list = [...minuteList, Date.now()];
    minuteWindows.set(chatId, list);
  }

  return { checkOutboundAllowed, recordOutbound };
}

module.exports = { createRateLimiter };
