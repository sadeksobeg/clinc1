"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type ConfirmArgs = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type AsyncActionOptions = {
  successToast?: string;
  errorToast?: string;
  confirm?: ConfirmArgs;
  /**
   * Custom confirm implementation. If not provided and confirm is set,
   * falls back to window.confirm.
   */
  confirmImpl?: (args: ConfirmArgs) => Promise<boolean>;
};

export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const run = useCallback(async <T,>(fn: (signal: AbortSignal) => Promise<T>, opts?: AsyncActionOptions): Promise<T | null> => {
    if (busy) return null;
    if (opts?.confirm) {
      const impl = opts.confirmImpl;
      const ok = impl
        ? await impl(opts.confirm)
        : window.confirm([opts.confirm.title, opts.confirm.description].filter(Boolean).join("\n\n"));
      if (!ok) return null;
    }
    setBusy(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const out = await fn(controller.signal);
      if (opts?.successToast) toast.success(opts.successToast);
      // P12.4: deterministic UX - invalidate commonly mutated platform keys.
      // This is conservative; pages can still override with targeted invalidations later.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["system-state"] }),
        queryClient.invalidateQueries({ queryKey: ["incidents"] }),
        queryClient.invalidateQueries({ queryKey: ["decisions"] }),
        queryClient.invalidateQueries({ queryKey: ["actions"] }),
      ]).catch(() => undefined);
      return out;
    } catch (e) {
      const msg = e instanceof Error ? e.message : opts?.errorToast || "حدث خطأ غير متوقع";
      toast.error(opts?.errorToast || msg);
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy, queryClient]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { busy, run, abort };
}

