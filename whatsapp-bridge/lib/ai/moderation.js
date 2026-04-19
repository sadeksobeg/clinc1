/**
 * Lightweight moderation / safety signals for Arabic + English inbound.
 * Does not replace clinical judgment — use for routing + escalation hints.
 */

const PROFANITY_AR = ["كس", "خرا", "يلعن", "قحبة"];
const PROFANITY_EN = ["fuck", "shit", "bitch", "asshole"];
const ANGRY = ["غبي", "زفت", "نصاب", "stupid", "scam", "worst", "terrible", "disaster"];
const MEDICAL_UNSAFE = [
  "تشخيصك",
  "عندك سرطان",
  "you have cancer",
  "take this medication",
  "جرعة",
  "diagnosis is",
];

function containsAny(text, list) {
  const t = String(text || "").toLowerCase();
  return list.some((w) => t.includes(w.toLowerCase()));
}

/**
 * @returns {{ profanity: boolean, angry: boolean, medicalUnsafe: boolean, escalate: boolean, score: number }}
 */
function analyzeInbound(text) {
  const profanity = containsAny(text, PROFANITY_AR) || containsAny(text, PROFANITY_EN);
  const angry = containsAny(text, ANGRY);
  const medicalUnsafe = containsAny(text, MEDICAL_UNSAFE);
  let score = 1;
  if (profanity) score -= 0.35;
  if (angry) score -= 0.25;
  if (medicalUnsafe) score -= 0.5;
  score = Math.max(0, Math.min(1, score));
  const escalate = profanity || medicalUnsafe || (angry && score < 0.55);
  return { profanity, angry, medicalUnsafe, escalate, score: Number(score.toFixed(2)) };
}

function bilingualHint(replyAr, replyEn) {
  const ar = String(replyAr || "").trim();
  const en = String(replyEn || "").trim();
  if (ar && en) return `${ar}\n---\n${en}`;
  return ar || en || "";
}

module.exports = { analyzeInbound, bilingualHint };
