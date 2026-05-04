"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function WorkspacePanel({
  title,
  subtitle,
  right,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card
      className={cn(
        "glass-card overflow-hidden hover:border-border clinic-motion duration-ds-normal ease-ds-out",
        className,
      )}
    >
      {title || right || subtitle ? (
        <div className="shrink-0 border-b border-border/60 bg-background/40 px-cg-4 py-cg-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-cg-3">
            <div className="min-w-0">
              {title ? <p className="truncate text-ds-body font-semibold">{title}</p> : null}
              {subtitle ? <p className="mt-cg-1 truncate text-ds-small text-muted-foreground">{subtitle}</p> : null}
            </div>
            {right ? <div className="flex items-center gap-cg-2">{right}</div> : null}
          </div>
        </div>
      ) : null}
      <div className={cn("p-cg-4", contentClassName)}>{children}</div>
    </Card>
  );
}
