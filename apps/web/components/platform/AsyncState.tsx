"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoadingState({ title = "Loading..." }: { title?: string }) {
  return (
    <div className="glass-card rounded-2xl border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <div className="mt-4 space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/40" />
      </div>
    </div>
  );
}

export function EmptyState({
  title = "No data",
  description = "لا توجد بيانات لعرضها حاليا.",
  icon,
  actionLabel,
  onAction,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="glass-card rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        {icon ? <div className="mt-0.5 text-muted-foreground">{icon}</div> : null}
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {actionLabel && onAction ? (
        <div className="mt-4">
          <Button variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = "Failed to load",
  description = "تعذر تحميل البيانات. حاول مرة أخرى.",
  onRetry,
  tone = "danger",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  tone?: "danger" | "warning";
}) {
  return (
    <div
      className={cn(
        "glass-card rounded-2xl border bg-card p-6",
        tone === "danger" ? "border-danger/40 bg-danger/5" : "border-warning/50 bg-warning/10",
      )}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {onRetry ? (
        <div className="mt-4">
          <Button variant="outline" onClick={onRetry}>
            إعادة المحاولة
          </Button>
        </div>
      ) : null}
    </div>
  );
}

