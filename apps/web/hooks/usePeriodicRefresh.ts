"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Skip auto-refresh when returning after this long in a background tab (reduces load / stale bursts). */
const MAX_HIDDEN_MS_BEFORE_SKIP_REFRESH = 60_000;

export function usePeriodicRefresh(args?: {
  intervalMs?: number;
  enabled?: boolean;
  beforeRefresh?: (reason: string) => void;
  /** When false, interval/focus/visibility refresh is skipped (e.g. user typing). */
  shouldRefresh?: () => boolean;
}) {
  const router = useRouter();
  const enabled = args?.enabled !== false;
  const intervalMs = args?.intervalMs ?? 20_000;
  const lastRef = useRef<number>(0);
  const hiddenAtRef = useRef<number | null>(null);
  const beforeRefreshRef = useRef<((reason: string) => void) | undefined>(args?.beforeRefresh);
  beforeRefreshRef.current = args?.beforeRefresh;
  const shouldRefreshRef = useRef<(() => boolean) | undefined>(args?.shouldRefresh);
  shouldRefreshRef.current = args?.shouldRefresh;

  useEffect(() => {
    if (!enabled) return;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

    function refresh(tag: string) {
      if (shouldRefreshRef.current && !shouldRefreshRef.current()) return;
      const now = Date.now();
      // Guard against accidental rapid refresh loops (focus+interval+visibility).
      if (now - lastRef.current < Math.min(intervalMs, 10_000)) return;
      lastRef.current = now;
      beforeRefreshRef.current?.(tag);
      router.refresh();
    }

    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refresh("interval");
    }, intervalMs);
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      refresh("focus");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt != null && Date.now() - hiddenAt > MAX_HIDDEN_MS_BEFORE_SKIP_REFRESH) return;
      refresh("visible");
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, router]);
}

