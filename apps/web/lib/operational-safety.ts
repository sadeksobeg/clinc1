import { DateTime } from "luxon";
import { appendLog as brainAppendLog } from "@/lib/clinic-brain/logging";

export type SafeActionOptions<T> = {
  action: () => Promise<T>;
  onSuccess?: (res: T) => void;
  onError?: (err: unknown) => void;
  /** Extra attempts after the first failure (0 = no retry). */
  retries?: number;
  label?: string;
};

export async function runSafeAction<T>(opts: SafeActionOptions<T>): Promise<T | undefined> {
  const retries = opts.retries ?? 0;
  const label = opts.label ?? "action";

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await opts.action();
      opts.onSuccess?.(res);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) {
        opts.onError?.(err);
        return undefined;
      }
    }
  }
  opts.onError?.(lastErr);
  return undefined;
}

const entityLocks = new Set<string>();

/**
 * Prevents overlapping async work for the same key (e.g. `appointment:42`).
 * Returns false if already locked (second click ignored).
 */
export async function tryWithEntityLock<T>(key: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  if (entityLocks.has(key)) return { ok: false };
  entityLocks.add(key);
  try {
    const value = await fn();
    return { ok: true, value };
  } finally {
    entityLocks.delete(key);
  }
}

export function logOperationalAction(payload: Record<string, unknown>): void {
  const t = DateTime.utc().toISO() ?? new Date().toISOString();
  const row = { ...payload, t };
  console.info("[clinic-ops]", row);
  const kind = typeof payload.kind === "string" ? payload.kind : "operational";
  brainAppendLog({ t, kind, ...payload });
}
