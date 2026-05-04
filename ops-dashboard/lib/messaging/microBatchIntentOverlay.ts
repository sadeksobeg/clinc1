/**
 * Optional structured prefix for interpret so "last line" intent is explicit vs prior context
 * (micro-batch smart_last). Same single string contract as interpret input.
 */

import { inboundMicroBatchSmartSeparator } from "./postIngestMicroBatch";

function intentOverlayEnabled(): boolean {
  return (process.env.INBOUND_INTENT_OVERLAY || "").trim() === "1";
}

/** True if text looks like smart_last merge (context + default separator + primary). */
export function textLooksLikeSmartLastMerge(text: string): boolean {
  const sep = inboundMicroBatchSmartSeparator();
  return sep.length > 0 && text.includes(sep);
}

/**
 * Wrap merged patient text as [CTX]/[LAST] blocks when overlay is on or text matches smart_last shape.
 */
export function applyIntentOverlayIfApplicable(text: string): string {
  const t = text || "";
  if (!t.trim()) return t;
  const sep = inboundMicroBatchSmartSeparator();
  /** Explicit env OR detected smart_last merge shape (same separator as postIngestMicroBatch). */
  if (!intentOverlayEnabled() && !textLooksLikeSmartLastMerge(t)) return t;
  if (!t.includes(sep)) return t;
  const idx = t.lastIndexOf(sep);
  if (idx < 0) return t;
  const ctx = t.slice(0, idx).trim();
  const last = t.slice(idx + sep.length).trim();
  if (!last) return t;
  if (!ctx) return `[LAST]\n${last}\n[/LAST]`;
  return `[CTX]\n${ctx}\n[/CTX]\n[LAST]\n${last}\n[/LAST]`;
}
