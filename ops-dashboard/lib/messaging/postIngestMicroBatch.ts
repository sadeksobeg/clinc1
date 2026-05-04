import type { PostIngestJobV2 } from "./inboundDeferredJobV2";
import { parsePostIngestJobV2, serializePostIngestJobV2 } from "./inboundDeferredJobV2";

const DEFAULT_MAX_LEN = 4000;

export function inboundMicroBatchMaxTotal(): number {
  const n = Number(process.env.INBOUND_CONV_MICRO_BATCH_MAX || 5);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? Math.floor(n) : 5;
}

export type InboundMicroBatchTextMode = "concat" | "last" | "smart_last";

export function inboundMicroBatchTextMode(): InboundMicroBatchTextMode {
  const m = (process.env.INBOUND_MICRO_BATCH_TEXT_MODE || "concat").trim().toLowerCase();
  if (m === "last") return "last";
  if (m === "smart_last" || m === "smart") return "smart_last";
  return "concat";
}

export function inboundMicroBatchSmartSeparator(): string {
  const s = (process.env.INBOUND_MICRO_BATCH_SMART_SEPARATOR || "").trim();
  return s.length > 0 ? s : "\n\n---\n";
}

/**
 * Last message = primary (intent anchor); earlier lines = context only, truncated from the start if needed.
 */
function mergeTextsSmartLast(parts: string[], totalMax: number): string {
  const cleaned = parts.map((p) => (p || "").trim()).filter(Boolean);
  if (!cleaned.length) return "";
  if (cleaned.length === 1) return cleaned[0]!.slice(0, totalMax);
  const sep = inboundMicroBatchSmartSeparator();
  const primaryRaw = cleaned[cleaned.length - 1]!;
  const contextLines = cleaned.slice(0, -1);
  let context = contextLines.join("\n");
  const primaryCap = Math.min(primaryRaw.length, Math.max(80, Math.floor(totalMax * 0.5)));
  const primary = primaryRaw.slice(0, primaryCap);
  let maxContext = totalMax - primary.length - sep.length;
  if (maxContext < 0) maxContext = 0;
  if (maxContext === 0) return primary.slice(0, totalMax);
  if (context.length > maxContext) {
    const ell = "…\n";
    const take = maxContext - ell.length;
    context = take > 0 ? `${ell}${context.slice(context.length - take)}` : ell.slice(0, maxContext);
  }
  const out = context ? `${context}${sep}${primary}` : primary;
  return out.length <= totalMax ? out : out.slice(0, totalMax);
}

function mergeTexts(parts: string[], mode: InboundMicroBatchTextMode, maxLen: number): string {
  const cleaned = parts.map((p) => (p || "").trim()).filter(Boolean);
  if (!cleaned.length) return "";
  if (mode === "smart_last") return mergeTextsSmartLast(cleaned, maxLen);
  if (mode === "last") return cleaned[cleaned.length - 1]!.slice(0, maxLen);
  const joined = cleaned.join("\n");
  return joined.length <= maxLen ? joined : joined.slice(joined.length - maxLen);
}

/**
 * Merge oldest → newest: anchor ids and metadata on the newest job; combine patient text for one interpret pass.
 */
export function mergePostIngestJobGroup(jobs: PostIngestJobV2[]): PostIngestJobV2 {
  if (jobs.length === 0) {
    throw new Error("mergePostIngestJobGroup: empty");
  }
  if (jobs.length === 1) return jobs[0]!;
  const oldest = jobs[0]!;
  const newest = jobs[jobs.length - 1]!;
  const mode = inboundMicroBatchTextMode();
  const maxLen = (() => {
    const n = Number(process.env.INBOUND_MICRO_BATCH_MAX_TEXT_LEN || DEFAULT_MAX_LEN);
    return Number.isFinite(n) && n >= 500 && n <= 50_000 ? Math.floor(n) : DEFAULT_MAX_LEN;
  })();
  const texts = jobs.map((j) => j.text);
  const mergedText = mergeTexts(texts, mode, maxLen);

  const merged: PostIngestJobV2 = {
    ...newest,
    lane: newest.lane ?? oldest.lane,
    text: mergedText,
    crm: {
      ...newest.crm,
      text: mergedText,
    },
    norm: {
      ...newest.norm,
      text: mergedText,
    },
    /** Prefer oldest correlation for trace continuity when batching. */
    correlationId: oldest.correlationId ?? newest.correlationId,
    claimed_at: newest.claimed_at,
    lease_until: newest.lease_until,
  };
  return merged;
}

export function parseAndMergePeekedTail(
  head: PostIngestJobV2,
  tailJsonLines: string[],
): { job: PostIngestJobV2; consumedTailCount: number } {
  const tails: PostIngestJobV2[] = [];
  for (const line of tailJsonLines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      break;
    }
    const j = parsePostIngestJobV2(parsed);
    if (!j) break;
    if (j.conversation_id !== head.conversation_id) break;
    tails.push(j);
  }
  if (!tails.length) return { job: head, consumedTailCount: 0 };
  return { job: mergePostIngestJobGroup([head, ...tails]), consumedTailCount: tails.length };
}

export function reapplyLease(job: PostIngestJobV2, leaseMs: number): { job: PostIngestJobV2; leasedStr: string } {
  const now = Date.now();
  const leased: PostIngestJobV2 = {
    ...job,
    claimed_at: now,
    lease_until: now + leaseMs,
  };
  return { job: leased, leasedStr: serializePostIngestJobV2(leased) };
}
