"use client";

import Link from "next/link";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toClinicZoned } from "@/lib/format";
import type { WorkspaceMode } from "@/hooks/use-ui-preferences";
import {
  formatSyncClock,
  sessionEndsInLabel,
  timeLabel,
} from "@/features/appointments/use-clinic-day-operations";
import type { ClinicDayOperationsResult } from "@/features/appointments/use-clinic-day-operations";
import { loadLevel, pickNextToCall } from "@/lib/clinic-brain/selection";

type Props = {
  ops: ClinicDayOperationsResult;
  clinicTimezone: string;
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (m: WorkspaceMode) => void;
  doctorFilter: string;
  setDoctorFilter: (v: string) => void;
  doctorFilterOptions: string[];
};

export function NurseControlStrip({
  ops,
  clinicTimezone,
  workspaceMode,
  setWorkspaceMode,
  doctorFilter,
  setDoctorFilter,
  doctorFilterOptions,
}: Props) {
  const { todayTimeline, projectionById, todayOps, lastSyncAt, nowZoned, hardOperationalLock } = ops;
  const active = todayTimeline.active;

  const activeLine = (() => {
    if (!active) return "لا يوجد كشف جاري الآن.";
    const doc = active.doctor_name ?? "طبيب";
    const end = toClinicZoned(active.ends_at, clinicTimezone);
    const lab = sessionEndsInLabel(nowZoned, end);
    const p = projectionById.get(active.id);
    if (p?.bucket === "NOW") {
      const tail = lab ? ` — ${lab}` : "";
      return `كشف جاري — ${doc}${tail}`;
    }
    return `الموعد الحالي — ${doc} · ${timeLabel(toClinicZoned(active.starts_at, clinicTimezone))}`;
  })();

  const lateCount = todayOps.lateItems.length;
  const inClinicCount = todayOps.checkedInItems.length;
  const nextDecision = pickNextToCall({
    serveNext: todayTimeline.serveNext,
    calendarNext: todayTimeline.calendarNext,
  });
  const load = loadLevel({
    lateCount,
    checkedInCount: inClinicCount,
    projection: projectionById,
  });
  const nextAppt = nextDecision.serveNext ?? nextDecision.calendarNext;
  const nextLine = nextAppt
    ? `${nextAppt.patient_display_name ?? "مريض"} · ${timeLabel(toClinicZoned(nextAppt.starts_at, clinicTimezone))}`
    : "— لا يوجد تالي واضح في الطابور";
  const delayLine =
    load.totalDelayMinutes > 0
      ? `تراكم تأخير ~${Math.round(load.totalDelayMinutes)} د`
      : lateCount > 0
        ? `متأخرون: ${lateCount}`
        : "لا تراكم تأخير يُذكر";

  return (
    <div className="sticky top-0 z-20 shrink-0 rounded-2xl border border-border/80 bg-background/95 px-cg-4 py-cg-3 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-cg-3 gap-y-cg-2">
        <div className="min-w-0 flex-1 basis-[200px] shrink-0">
          <p className="text-ds-label text-muted-foreground">
            الآن <span className="font-mono text-foreground">{nowZoned.setLocale("ar").toFormat("HH:mm")}</span>
          </p>
          <p className="truncate text-ds-body font-semibold text-foreground">{activeLine}</p>
          {nextDecision.isServeCalendarConflict ? (
            <p className="mt-cg-0.5 inline-flex items-center gap-cg-1 rounded-md bg-warning/15 px-cg-1.5 py-cg-0.5 text-ds-label text-warning">
              <AlertTriangle className="size-3.5" />
              التالي تشغيلي ≠ التقويمي — تأكد قبل النداء
            </p>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 basis-[220px] rounded-xl border border-border/50 bg-muted/25 px-cg-3 py-cg-2">
          <p className="text-ds-label text-muted-foreground">التالي</p>
          <p className="truncate text-ds-body font-medium text-foreground">{nextLine}</p>
        </div>

        <div className="flex flex-wrap items-center gap-cg-2">
          <Badge variant={lateCount ? "danger" : "secondary"} className="gap-cg-1">
            متأخرون: {lateCount}
          </Badge>
          <Badge variant={inClinicCount ? "success" : "secondary"} className="gap-cg-1">
            داخل: {inClinicCount}
          </Badge>
          {load.level !== "normal" ? (
            <Badge variant={load.level === "critical" ? "danger" : "warning"} className="gap-cg-1">
              {load.level === "critical" ? "LOAD حرج" : "LOAD عالٍ"}
              {load.totalDelayMinutes > 0 ? ` · ~${load.totalDelayMinutes}د` : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-cg-1 text-muted-foreground">
              LOAD عادي
            </Badge>
          )}
          <Badge variant="outline" className="max-w-[14rem] gap-cg-1 truncate text-ds-label" title={delayLine}>
            DELAY: {delayLine}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-cg-2 border-border/60 md:border-s md:ps-cg-3">
          <span className="text-ds-label text-muted-foreground">وضع العمل</span>
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            <Button
              type="button"
              size="sm"
              variant={workspaceMode !== "doctor" ? "default" : "ghost"}
              className={cn("h-8 px-cg-3 text-ds-label", workspaceMode === "doctor" ? "text-muted-foreground" : "")}
              disabled={hardOperationalLock}
              onClick={() => setWorkspaceMode("reception")}
            >
              استقبال
            </Button>
            <Button
              type="button"
              size="sm"
              variant={workspaceMode === "doctor" ? "default" : "ghost"}
              className={cn("h-8 px-cg-3 text-ds-label", workspaceMode === "doctor" ? "" : "text-muted-foreground")}
              disabled={hardOperationalLock}
              onClick={() => setWorkspaceMode("doctor")}
            >
              طبيب
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-cg-2 md:ms-auto">
          <div className="flex items-center gap-cg-2">
            <span className="text-ds-label text-muted-foreground">الطبيب</span>
            <select
              className="h-9 max-w-[11rem] rounded-lg border border-border bg-background px-cg-2 text-ds-small disabled:opacity-45"
              value={doctorFilter}
              disabled={hardOperationalLock}
              onChange={(e) => setDoctorFilter(e.target.value)}
            >
              {doctorFilterOptions.map((d) => (
                <option key={d} value={d}>
                  {d === "all" ? "كل الأطباء" : d}
                </option>
              ))}
            </select>
          </div>
          <p className="font-mono text-ds-label text-muted-foreground">
            آخر مزامنة {lastSyncAt != null ? formatSyncClock(lastSyncAt) : "—"}
          </p>
          <Button variant="outline" size="sm" asChild className="gap-cg-1">
            <Link href="/analytics">
              <BarChart3 className="size-4" />
              مؤشرات وتقارير
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
