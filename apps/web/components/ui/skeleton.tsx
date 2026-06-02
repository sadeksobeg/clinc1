import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-gradient-to-l from-muted/80 via-muted/50 to-muted/80", className)} />;
}
