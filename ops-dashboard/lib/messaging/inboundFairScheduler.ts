/**
 * Weighted fair ordering for which conversation to try next (v3).
 * Avoids pure "always serve lowest head_prio" starvation of normal/low buckets.
 */

export const DEFAULT_FAIR_PATTERN_RANKS = [1, 1, 2, 1, 2, 3] as const;

/** Parse `INBOUND_FAIR_PATTERN` e.g. `1,1,2,1,2,3` into rank integers 1|2|3. */
export function parseFairPatternFromEnv(): number[] {
  const raw = (process.env.INBOUND_FAIR_PATTERN || "").trim();
  if (!raw) return [...DEFAULT_FAIR_PATTERN_RANKS];
  const parts = raw.split(/[,;\s]+/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (n === 1 || n === 2 || n === 3) out.push(n);
  }
  return out.length ? out : [...DEFAULT_FAIR_PATTERN_RANKS];
}

export type PrioEntry = { id: string; prio: number };

function bucketRank(prio: number): 1 | 2 | 3 {
  if (prio === 1) return 1;
  if (prio === 2) return 2;
  return 3;
}

/**
 * Build visit order for pending conversations: one emit per pattern slot from that
 * bucket only (high=1, normal=2, low=3), sweeping the pattern until all are included.
 */
export function fairConversationIdOrder(entries: PrioEntry[], pattern: number[]): string[] {
  if (!entries.length) return [];
  const pat = pattern.length ? pattern : [...DEFAULT_FAIR_PATTERN_RANKS];
  const by: Record<1 | 2 | 3, string[]> = { 1: [], 2: [], 3: [] };
  for (const e of entries) {
    by[bucketRank(e.prio)].push(e.id);
  }
  for (const r of [1, 2, 3] as const) {
    by[r].sort((a, b) => Number(a) - Number(b));
  }
  const idx: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  const out: string[] = [];
  const seen = new Set<string>();
  let sweeps = 0;
  while (seen.size < entries.length && sweeps < entries.length * pat.length + 8) {
    for (let s = 0; s < pat.length && seen.size < entries.length; s++) {
      const r = pat[s] as 1 | 2 | 3;
      if (r !== 1 && r !== 2 && r !== 3) continue;
      const bucket = by[r];
      while (idx[r] < bucket.length) {
        const id = bucket[idx[r]++]!;
        if (!seen.has(id)) {
          seen.add(id);
          out.push(id);
          break;
        }
      }
    }
    sweeps += 1;
  }
  for (const e of entries) {
    if (!seen.has(e.id)) out.push(e.id);
  }
  return out;
}

/**
 * Rotate the fair order so the first `cursor % length` ids move to the end (RR between equal-weight tries).
 */
export function rotateOrder<T>(order: T[], cursor: number): T[] {
  if (!order.length) return order;
  const n = order.length;
  const off = ((cursor % n) + n) % n;
  return [...order.slice(off), ...order.slice(0, off)];
}
