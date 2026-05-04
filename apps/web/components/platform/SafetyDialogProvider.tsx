"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type RiskLevel = "low" | "medium" | "high" | "critical";

type SafetyPromptArgs = {
  title: string;
  description?: string;
  impact?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  minReasonLen?: number;
  riskLevel?: RiskLevel;
};

type SafetyPromptResult = { ok: true; reason: string } | { ok: false };

type Ctx = {
  askReason: (args: SafetyPromptArgs) => Promise<SafetyPromptResult>;
};

const SafetyDialogContext = createContext<Ctx | null>(null);

export function useSafetyDialog() {
  const ctx = useContext(SafetyDialogContext);
  if (!ctx) throw new Error("useSafetyDialog must be used within SafetyDialogProvider");
  return ctx;
}

export function SafetyDialogProvider({ children }: { children: React.ReactNode }) {
  const resolverRef = useRef<((v: SafetyPromptResult) => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [args, setArgs] = useState<SafetyPromptArgs | null>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");

  const close = useCallback((res: SafetyPromptResult) => {
    resolverRef.current?.(res);
    resolverRef.current = null;
    setOpen(false);
    setArgs(null);
    setReason("");
    setTyped("");
  }, []);

  const askReason = useCallback(async (a: SafetyPromptArgs): Promise<SafetyPromptResult> => {
    if (open) return { ok: false };
    setArgs(a);
    setOpen(true);
    return await new Promise<SafetyPromptResult>((resolve) => {
      resolverRef.current = resolve;
    });
  }, [open]);

  const minLen = args?.minReasonLen ?? 5;
  const needsTyped = args?.riskLevel === "critical";
  const typedToken = useMemo(() => (needsTyped ? "EXECUTE" : ""), [needsTyped]);
  const canConfirm =
    Boolean(args) &&
    reason.trim().length >= minLen &&
    (!needsTyped || typed.trim().toUpperCase() === typedToken);

  const value = useMemo<Ctx>(() => ({ askReason }), [askReason]);

  return (
    <SafetyDialogContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(v) => (!v ? close({ ok: false }) : null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{args?.title || "Confirm"}</DialogTitle>
            {args?.description ? <DialogDescription>{args.description}</DialogDescription> : null}
          </DialogHeader>

          {args?.impact ? (
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground">Impact</p>
              <p className="mt-1">{args.impact}</p>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium">{args?.reasonLabel || "Reason"}</p>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={args?.reasonPlaceholder || "Write a short reason"}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Minimum {minLen} characters.</p>
          </div>

          {needsTyped ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Typed confirmation</p>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${typedToken} to confirm`} />
              <p className={cn("text-xs", typed.trim().toUpperCase() === typedToken ? "text-muted-foreground" : "text-warning")}>
                This is a critical action.
              </p>
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => close({ ok: false })}>
              {args?.cancelLabel || "Cancel"}
            </Button>
            <Button disabled={!canConfirm} onClick={() => close({ ok: true, reason: reason.trim() })}>
              {args?.confirmLabel || "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SafetyDialogContext.Provider>
  );
}

