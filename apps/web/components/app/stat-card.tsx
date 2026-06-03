import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "danger" | "ai";
}) {
  const inner = (
    <div
      className={cn(
        "glass-card flex items-start justify-between gap-cg-3 p-cg-4 transition-colors",
        href && "hover:bg-muted/30",
        tone === "danger" && "border-danger/30",
        tone === "ai" && "ai-panel-border ai-panel-bg",
      )}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className={cn("mt-cg-1 text-2xl font-bold tabular-nums tracking-tight", tone === "ai" && "ai-panel-accent")}>
          {value}
        </p>
        {hint ? (
          <p className={cn("mt-cg-1 text-[11px]", tone === "danger" ? "text-danger" : "text-primary")}>{hint}</p>
        ) : null}
      </div>
      <div
        className={cn(
          "grid h-9 w-9 shrink-0 place-content-center rounded-lg",
          tone === "ai" ? "ai-panel-bg ai-panel-accent" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
