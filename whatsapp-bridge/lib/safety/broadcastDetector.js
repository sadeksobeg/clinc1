/**
 * Broadcast-pattern circuit breaker.
 *
 * Watches the unique chat_ids each outbound `text_hash` is sent to within
 * a sliding window. If a single hash reaches `uniqueChatsThreshold`, the
 * bridge "trips" and rejects all outbound sends for `pauseMs`. This guards
 * against an FSM bug or rogue caller using the bridge as a mass-message
 * fanout (which is the strongest indicator WhatsApp uses for bans).
 *
 * All state is in-memory; the breaker resets after process restart, which
 * is intentional — a restart is enough cooldown.
 */
function createBroadcastDetector(opts) {
  const windowMs = Math.max(60_000, Number(opts.windowMs) || 600_000);
  const uniqueChatsThreshold = Math.max(3, Number(opts.uniqueChatsThreshold) || 12);
  const pauseMs = Math.max(60_000, Number(opts.pauseMs) || 300_000);
  const onTrip = typeof opts.onTrip === "function" ? opts.onTrip : () => undefined;

  /** @type {Map<string, Map<string, number>>} hash → (chatId → lastSeenMs) */
  const hashChatMap = new Map();
  let pausedUntil = 0;
  let lastTripAt = 0;
  let lastTripHash = "";
  let lastTripChats = 0;

  function prune(now) {
    const cutoff = now - windowMs;
    for (const [hash, byChat] of hashChatMap.entries()) {
      for (const [chatId, ts] of byChat.entries()) {
        if (ts < cutoff) byChat.delete(chatId);
      }
      if (byChat.size === 0) hashChatMap.delete(hash);
    }
  }

  /**
   * @returns {{ ok: true } | { ok: false, reason: string, paused_until: number }}
   */
  function checkBeforeSend() {
    const now = Date.now();
    if (now < pausedUntil) {
      return {
        ok: false,
        reason: "broadcast_circuit_open",
        paused_until: pausedUntil,
      };
    }
    return { ok: true };
  }

  function recordSend(textHash, chatId) {
    const now = Date.now();
    prune(now);
    let byChat = hashChatMap.get(textHash);
    if (!byChat) {
      byChat = new Map();
      hashChatMap.set(textHash, byChat);
    }
    byChat.set(chatId, now);
    if (byChat.size >= uniqueChatsThreshold) {
      pausedUntil = now + pauseMs;
      lastTripAt = now;
      lastTripHash = textHash;
      lastTripChats = byChat.size;
      try {
        onTrip({
          hash: textHash,
          unique_chats: byChat.size,
          window_ms: windowMs,
          paused_until: pausedUntil,
        });
      } catch {
        /* ignore */
      }
    }
  }

  function snapshot() {
    return {
      window_ms: windowMs,
      unique_chats_threshold: uniqueChatsThreshold,
      pause_ms: pauseMs,
      paused: Date.now() < pausedUntil,
      paused_until: pausedUntil,
      last_trip_at: lastTripAt,
      last_trip_hash: lastTripHash,
      last_trip_chats: lastTripChats,
    };
  }

  function reset() {
    pausedUntil = 0;
    hashChatMap.clear();
  }

  return { checkBeforeSend, recordSend, snapshot, reset };
}

module.exports = { createBroadcastDetector };
