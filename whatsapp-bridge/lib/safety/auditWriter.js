/**
 * Fire-and-forget audit log for every outbound attempt (sent / blocked / failed).
 *
 * Posts to `ops-dashboard /api/internal/wa-audit/record` (Bearer-authenticated).
 * Failures are swallowed so audit never affects send latency or success — at
 * worst we lose a row. The receiving endpoint inserts into `wa_send_audit`.
 */
const crypto = require("crypto");

function hashText(text) {
  return crypto.createHash("sha1").update(String(text || "")).digest("hex").slice(0, 16);
}

function createAuditWriter(opts) {
  const enabled = Boolean(opts.enabled);
  const endpoint = String(opts.endpoint || "").trim();
  const token = String(opts.token || "").trim();
  const metrics = opts.metrics || { inc: () => {} };
  const logEvent = typeof opts.logEvent === "function" ? opts.logEvent : () => undefined;
  const provider = String(opts.provider || "whatsapp_web_js");
  const timeoutMs = Number(opts.timeoutMs) || 5_000;

  if (enabled && (!endpoint || !token)) {
    logEvent("audit_disabled_misconfig", {
      reason: !endpoint ? "missing_endpoint" : "missing_token",
    });
  }

  /**
   * @param {{
   *   chat_id: string,
   *   to_number?: string|null,
   *   clinic_id?: number|null,
   *   doctor_id?: number|null,
   *   text: string,
   *   status: 'sent'|'retry'|'failed'|'blocked'|'dropped',
   *   blocked_reason?: string|null,
   *   latency_ms?: number|null,
   *   correlation_id?: string|null,
   *   send_kind?: string,
   * }} row
   */
  async function record(row) {
    if (!enabled || !endpoint || !token) return;
    try {
      const body = JSON.stringify({
        chat_id: String(row.chat_id || ""),
        to_number: row.to_number || null,
        clinic_id: row.clinic_id ?? null,
        doctor_id: row.doctor_id ?? null,
        text_hash: hashText(row.text || ""),
        text_length: String(row.text || "").length,
        has_link: /https?:\/\//i.test(String(row.text || "")),
        send_kind: row.send_kind || "patient_reply",
        provider,
        status: row.status,
        blocked_reason: row.blocked_reason || null,
        latency_ms: row.latency_ms ?? null,
        correlation_id: row.correlation_id || null,
      });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body,
          signal: ctrl.signal,
        });
        if (!res.ok) {
          metrics.inc("audit_fail_total");
          logEvent("audit_post_failed", { status: res.status, chat_id: row.chat_id });
        } else {
          metrics.inc("audit_ok_total");
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      metrics.inc("audit_fail_total");
      logEvent("audit_post_failed", {
        chat_id: row.chat_id,
        error: e && e.message ? String(e.message) : String(e),
      });
    }
  }

  return { record, enabled };
}

module.exports = { createAuditWriter };
