const DEFAULT_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryStatuses?: Set<number>;
  /** Aborts the request after this many ms (network resilience). */
  timeoutMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: RetryOptions,
): Promise<Response> {
  const retries = options?.retries ?? 2;
  const baseDelayMs = options?.baseDelayMs ?? 250;
  const maxDelayMs = options?.maxDelayMs ?? 2000;
  const retryStatuses = options?.retryStatuses ?? DEFAULT_RETRY_STATUSES;

  let attempt = 0;
  let lastError: unknown;
  while (attempt <= retries) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutMs = options?.timeoutMs ?? 0;
      let signal = init?.signal;
      if (timeoutMs > 0) {
        const timeoutCtrl = new AbortController();
        timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
        const userSig = init?.signal;
        if (userSig) {
          if (userSig.aborted) {
            timeoutCtrl.abort();
          } else {
            const merged = new AbortController();
            const fire = () => merged.abort();
            userSig.addEventListener("abort", fire);
            timeoutCtrl.signal.addEventListener("abort", fire);
            signal = merged.signal;
          }
        } else {
          signal = timeoutCtrl.signal;
        }
      }

      const res = await fetch(input, { ...init, signal });
      if (!retryStatuses.has(res.status) || attempt >= retries) return res;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(delay);
    } catch (e) {
      lastError = e;
      if (attempt >= retries) throw e;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(delay);
    } finally {
      if (timer) clearTimeout(timer);
    }
    attempt += 1;
  }
  if (lastError) throw lastError;
  throw new Error("fetchWithRetry failed");
}
