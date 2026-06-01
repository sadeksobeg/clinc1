/**
 * Per-day outbound caps.
 *
 * Tracks three independent counters across a UTC-day boundary, each persisted
 * to an NDJSON file so a bridge restart doesn't reset the cap mid-day:
 *
 *   1. per-chat            — max replies/day to a single WhatsApp chat
 *   2. global              — max sends/day across the whole bridge
 *   3. per text-hash       — max sends of the same exact text/day (broadcast-like)
 *
 * The state file is a compact NDJSON `{ day:"YYYY-MM-DD", chat:{}, global, text:{} }`
 * rewritten on every recorded send (writes are cheap; ~10 sends/sec at peak).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function ymdUtc(d = new Date()) {
  return new Date(d).toISOString().slice(0, 10);
}

function safeReadJson(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return null;
    const last = raw.trim().split(/\r?\n/).pop();
    return last ? JSON.parse(last) : null;
  } catch {
    return null;
  }
}

function ensureDir(file) {
  const dir = path.dirname(file);
  if (dir && !fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
  }
}

function hashText(text) {
  return crypto.createHash("sha1").update(String(text || "")).digest("hex").slice(0, 16);
}

/**
 * @param {{
 *   stateFile: string,
 *   maxPerChat: number,
 *   maxGlobal: number,
 *   maxSameTextPerDay: number,
 * }} opts
 */
function createDailyCaps(opts) {
  const maxPerChat = Math.max(1, Number(opts.maxPerChat) || 60);
  const maxGlobal = Math.max(1, Number(opts.maxGlobal) || 1500);
  const maxSameTextPerDay = Math.max(1, Number(opts.maxSameTextPerDay) || 200);
  const stateFile = opts.stateFile || "logs/daily-caps-state.ndjson";

  let day = ymdUtc();
  let chat = {};
  let global = 0;
  let text = {};

  const persisted = safeReadJson(stateFile);
  if (persisted && persisted.day === day) {
    chat = persisted.chat && typeof persisted.chat === "object" ? persisted.chat : {};
    global = Number(persisted.global) || 0;
    text = persisted.text && typeof persisted.text === "object" ? persisted.text : {};
  }

  function rolloverIfNeeded() {
    const today = ymdUtc();
    if (today !== day) {
      day = today;
      chat = {};
      global = 0;
      text = {};
    }
  }

  function flush() {
    ensureDir(stateFile);
    try {
      const blob = JSON.stringify({ day, chat, global, text });
      fs.writeFileSync(stateFile, `${blob}\n`, "utf8");
    } catch {
      /* ignore — the in-memory state is still consistent */
    }
  }

  /**
   * Check whether a send is allowed under all three daily caps.
   * @returns {{ ok: true } | { ok: false, reason: string, limit: number, count: number }}
   */
  function checkBeforeSend(normalizedTo, sendText) {
    rolloverIfNeeded();
    if (global >= maxGlobal) {
      return { ok: false, reason: "daily_cap_global", limit: maxGlobal, count: global };
    }
    const c = chat[normalizedTo] || 0;
    if (c >= maxPerChat) {
      return { ok: false, reason: "daily_cap_per_chat", limit: maxPerChat, count: c };
    }
    const h = hashText(sendText);
    const t = text[h] || 0;
    if (t >= maxSameTextPerDay) {
      return { ok: false, reason: "daily_cap_same_text", limit: maxSameTextPerDay, count: t };
    }
    return { ok: true };
  }

  function recordAfterSend(normalizedTo, sendText) {
    rolloverIfNeeded();
    global += 1;
    chat[normalizedTo] = (chat[normalizedTo] || 0) + 1;
    const h = hashText(sendText);
    text[h] = (text[h] || 0) + 1;
    flush();
  }

  function snapshot() {
    rolloverIfNeeded();
    return {
      day,
      global,
      maxGlobal,
      maxPerChat,
      maxSameTextPerDay,
      chats: Object.keys(chat).length,
      distinct_texts: Object.keys(text).length,
      usage_global_pct: maxGlobal ? Math.min(1, global / maxGlobal) : 0,
    };
  }

  return { checkBeforeSend, recordAfterSend, snapshot };
}

module.exports = { createDailyCaps, hashText };
