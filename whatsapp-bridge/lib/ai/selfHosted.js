/**
 * Self-hosted LLM adapter (Ollama-compatible /api/chat).
 * Used by optional bridge endpoint or external workers — JSON-only, Arabic-first.
 */
const axios = require("axios");

const DEFAULT_SYSTEM = `أنت مصنّف رسائل لعيادة طبية. أجب بـ JSON فقط بدون markdown حسب المخطط:
{"intent":"GENERAL|BOOKING|PRICING|URGENT|COMPLAINT|FOLLOWUP|UNKNOWN","confidence":0-1,"handoff_required":boolean,"reply_ar":"نص قصير للمريض","medical_safe":true}
قواعد: لا تشخّص طبياً. إذا طوارئ أو ألم شديد ضع intent=URGENT وhandoff_required=true. ردود عربية فقط.`;

/**
 * @param {{ baseUrl: string, model: string, timeoutMs: number }} cfg
 * @param {{ userText: string, systemPrompt?: string }} input
 * @returns {Promise<{ raw: object, valid: boolean, failureReason?: string }>}
 */
async function chatJsonCompletion(cfg, input) {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/api/chat`;
  const system = input.systemPrompt || DEFAULT_SYSTEM;
  const body = {
    model: cfg.model,
    stream: false,
    format: "json",
    messages: [
      { role: "system", content: system },
      { role: "user", content: String(input.userText || "").slice(0, 2000) },
    ],
  };
  try {
    const res = await axios.post(url, body, { timeout: cfg.timeoutMs || 60_000 });
    const message = res.data?.message?.content || res.data?.response || "";
    let parsed;
    try {
      parsed = typeof message === "string" ? JSON.parse(message) : message;
    } catch {
      return { raw: { message }, valid: false, failureReason: "invalid_json" };
    }
    const valid =
      parsed &&
      typeof parsed.intent === "string" &&
      typeof parsed.reply_ar === "string" &&
      typeof parsed.confidence === "number";
    return {
      raw: parsed,
      valid,
      failureReason: valid ? undefined : "schema_mismatch",
    };
  } catch (e) {
    return {
      raw: {},
      valid: false,
      failureReason: e?.message || String(e),
    };
  }
}

function applyMedicalSafeGuard(parsed, userText) {
  const lower = String(userText || "").toLowerCase();
  const urgentHints = ["طوارئ", "نزيف", "اسعاف", "ألم شديد", "emergency", "urgent"];
  const forced = urgentHints.some((k) => lower.includes(k));
  if (!parsed || typeof parsed !== "object") return null;
  const out = { ...parsed };
  if (forced) {
    out.intent = "URGENT";
    out.handoff_required = true;
    out.confidence = Math.max(Number(out.confidence) || 0, 0.9);
  }
  if (out.medical_safe !== true) {
    out.handoff_required = true;
  }
  return out;
}

module.exports = { chatJsonCompletion, applyMedicalSafeGuard, DEFAULT_SYSTEM };
