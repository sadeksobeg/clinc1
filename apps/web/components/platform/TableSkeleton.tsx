"use client";

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="space-y-3">
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted/40" />
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, idx) => (
            <div key={idx} className="h-10 animate-pulse rounded-xl bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TableToolbar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

