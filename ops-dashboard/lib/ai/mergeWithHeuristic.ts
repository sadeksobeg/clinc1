import type { InterpretResult } from "@/lib/scheduling/types";
import { interpretInboundText } from "@/lib/scheduling/interpret";

/**
 * Intent layer with built-in heuristic fallback (implemented inside `interpretInboundText`).
 * Use this import when you want an explicit "AI + rules" boundary in callers.
 */
export async function mergeInterpretWithHeuristic(text: string): Promise<InterpretResult> {
  return interpretInboundText(text);
}
