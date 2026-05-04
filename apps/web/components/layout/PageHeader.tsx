"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-cg-4", className)}>
      <div className="min-w-0">
        {subtitle ? <p className="text-ds-body text-muted-foreground">{subtitle}</p> : null}
        <h1 className="mt-cg-1 text-ds-h1 font-semibold tracking-tight">{title}</h1>
      </div>
      {right ? <div className="flex items-center gap-cg-2">{right}</div> : null}
    </header>
  );
}
