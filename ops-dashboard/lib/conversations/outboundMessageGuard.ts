import { writeStructuredLog } from "@/lib/observability/trace";
import { incProductMetric } from "@/lib/observability/productMetrics";

const MAX_LEN = Math.max(200, Number(process.env.P7_OUTBOUND_MAX_CHARS || 3500));

const HARD_BLOCK = [
  /\bkill yourself\b/i,
  /\bانتحر\b/i,
  /\bpassword\b.*\b(clinic|admin)\b/i,
];

const SOFT_SANITIZE = [
  /\bhttp:\/\/\S+/gi,
  /\bhttps:\/\/\S+/gi,
];

export type OutboundGuardOutcome =
  | { action: "send"; text: string }
  | { action: "sanitize"; text: string; reason: string }
  | { action: "block"; reason: string };

/**
 * P7 Day 3 — pre-send validation for patient-visible WhatsApp text.
 */
export async function guardOutboundPatientText(args: {
  text: string;
  clinicId: number;
  conversationId?: number | null;
  source: string;
}): Promise<OutboundGuardOutcome> {
  const raw = args.text ?? "";
  if (!raw.trim()) {
    return { action: "block", reason: "empty_text" };
  }
  if (raw.length > MAX_LEN) {
    incProductMetric("outbound_guard_length_block_total");
    try {
      await writeStructuredLog({
        level: "warn",
        eventName: "conversation.outbound_guard",
        clinicId: args.clinicId,
        message: "Outbound blocked: length",
        payload: { source: args.source, len: raw.length, max: MAX_LEN, conversation_id: args.conversationId },
      });
    } catch {
      /* optional DB in unit tests */
    }
    return { action: "block", reason: "max_length_exceeded" };
  }

  for (const p of HARD_BLOCK) {
    if (p.test(raw)) {
      incProductMetric("outbound_guard_hard_block_total");
      try {
        await writeStructuredLog({
          level: "error",
          eventName: "conversation.outbound_guard",
          clinicId: args.clinicId,
          message: "Outbound hard-blocked",
          payload: { source: args.source, pattern: p.source, conversation_id: args.conversationId },
        });
      } catch {
        /* optional DB in unit tests */
      }
      return { action: "block", reason: `forbidden_content:${p.source}` };
    }
  }

  let out = raw;
  let sanitized = false;
  for (const p of SOFT_SANITIZE) {
    const next = out.replace(p, "[link removed]");
    if (next !== out) sanitized = true;
    out = next;
  }
  if (sanitized) {
    incProductMetric("outbound_guard_sanitized_total");
    try {
      await writeStructuredLog({
        level: "info",
        eventName: "conversation.outbound_guard",
        clinicId: args.clinicId,
        message: "Outbound sanitized (URLs removed)",
        payload: { source: args.source, conversation_id: args.conversationId },
      });
    } catch {
      /* optional DB in unit tests */
    }
    return { action: "sanitize", text: out, reason: "urls_removed" };
  }

  return { action: "send", text: raw };
}
