"use client";

import { cn } from "@/lib/utils";
import type { ClinicDayOperationsResult } from "@/features/appointments/use-clinic-day-operations";

type Props = {
  ops: Pick<ClinicDayOperationsResult, "queueLoadSnapshot" | "hardOperationalLock">;
};

export function ClinicSystemStatusBar({ ops }: Props) {
  const { queueLoadSnapshot: load, hardOperationalLock } = ops;
  const { level, totalDelayMinutes, lateCount, reason } = load;

  const palette =
    level === "critical"
      ? {
          dot: "bg-danger",
          bar: "border-danger/50 bg-danger/[0.08]",
          title: "text-danger",
          subtitle: "text-danger/90",
        }
      : level === "high"
        ? {
            dot: "bg-warning",
            bar: "border-warning/50 bg-warning/[0.08]",
            title: "text-warning",
            subtitle: "text-warning/95",
          }
        : {
            dot: "bg-success",
            bar: "border-success/45 bg-success/[0.06]",
            title: "text-success",
            subtitle: "text-muted-foreground",
          };

  const headline =
    level === "critical"
      ? "ضغط حرج على الطابور"
      : level === "high"
        ? "ضغط متوسط إلى مرتفع"
        : "النظام مستقر";

  const detailParts = [
    lateCount > 0 ? `${lateCount} متأخر` : null,
    totalDelayMinutes > 0 ? `تراكم تأخير ~${Math.round(totalDelayMinutes)} دقيقة` : null,
    reason,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-cg-3 rounded-2xl border px-cg-4 py-cg-2.5 text-ds-small shadow-sm",
        palette.bar,
        hardOperationalLock ? "ring-2 ring-destructive/35" : "",
      )}
    >
      <div className="flex min-w-0 items-center gap-cg-2">
        <span className={cn("inline-block size-2.5 shrink-0 rounded-full", palette.dot)} aria-hidden />
        <div className="min-w-0">
          <p className={cn("font-semibold leading-tight", palette.title)}>{headline}</p>
          <p className={cn("mt-0.5 text-ds-label", palette.subtitle)}>
            {detailParts.length > 0 ? detailParts.join(" · ") : "لا تراكم تأخير مسجّل حاليًا على الإسقاط."}
          </p>
        </div>
      </div>
      {hardOperationalLock ? (
        <span className="shrink-0 rounded-lg bg-destructive/15 px-cg-2 py-cg-1 text-ds-label font-medium text-destructive">
          قفل تشغيلي صارم — نفّذ توصية الشريط أولًا
        </span>
      ) : null}
    </div>
  );
}
