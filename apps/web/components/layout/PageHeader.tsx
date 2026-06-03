"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  description,
  right,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-cg-4 border-b border-border/50 pb-cg-4 animate-fade-in", className)}>
      <div className="min-w-0 border-s-[3px] border-primary ps-cg-4">
        {subtitle ? <p className="text-[13px] text-muted-foreground">{subtitle}</p> : null}
        <h1 className="mt-cg-1 text-[1.35rem] font-bold leading-tight tracking-tight">{title}</h1>
        {description ? <div className="mt-cg-1 max-w-2xl text-ds-body text-muted-foreground">{description}</div> : null}
      </div>
      {right ? <div className="flex items-center gap-cg-2">{right}</div> : null}
    </header>
  );
}
