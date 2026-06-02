import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 px-cg-6 py-cg-8 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-cg-4 text-muted-foreground">{icon}</div> : null}
      <p className="text-ds-h3 font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-cg-2 max-w-md text-ds-body text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-cg-5">{action}</div> : null}
    </div>
  );
}
