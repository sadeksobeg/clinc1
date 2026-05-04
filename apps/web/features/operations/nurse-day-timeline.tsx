"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";
import { cn } from "@/lib/utils";
import { toClinicZoned } from "@/lib/format";
import { ARRIVAL_GRACE_MINUTES, ARRIVAL_REMIND_MINUTES } from "@/lib/clinic-message-templates";
import { isLateAfterGrace } from "@/lib/clinic-time";
import { statusLabel } from "@/lib/i18n/status";
import type { AppointmentRow } from "@/lib/ops-server";
import type { WorkspaceMode } from "@/hooks/use-ui-preferences";
import {
  appointmentOperationalStyle,
  arrivalLabel,
  relativeWindowLabel,
  timeLabel,
  type ClinicDayOperationsResult,
} from "@/features/appointments/use-clinic-day-operations";
import { computeAppointmentPrimaryAction } from "@/features/operations/appointment-row-actions";

type Props = {
  ops: ClinicDayOperationsResult;
  clinicTimezone: string;
  doctorFilter: string;
  appointmentsForFilter: AppointmentRow[];
  workspaceMode: WorkspaceMode;
  /** Narrow reference column on the nurse console; default is full-density planning view. */
  layoutDensity?: "default" | "compact";
};

export function NurseDayTimeline({
  ops,
  clinicTimezone,
  doctorFilter,
  appointmentsForFilter,
  workspaceMode,
  layoutDensity = "default",
}: Props) {
  const {
    calendarDays,
    slotsForDay,
    todayKey,
    nowHour,
    nowZoned,
    projectionById,
    gridScrollRef,
    apptElByIdRef,
    isApptBusy,
    patchAppointmentOptimistic,
    sendOperationalToPatient,
    openPatientConversation,
    todayOps,
    hardOperationalLock,
  } = ops;

  const isDoctorMode = workspaceMode === "doctor";

  const filtered = useMemo(() => {
    if (doctorFilter === "all") return appointmentsForFilter;
    return appointmentsForFilter.filter((r) => r.doctor_name === doctorFilter);
  }, [appointmentsForFilter, doctorFilter]);

  const slotMap = useMemo(() => {
    const m = new Map<string, AppointmentRow[]>();
    filtered.forEach((appt) => {
      const local = toClinicZoned(appt.starts_at, clinicTimezone);
      if (!local) return;
      const key = `${local.toISODate()}-${local.hour}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)?.push(appt);
    });
    return m;
  }, [filtered, clinicTimezone]);

  const todayDay = calendarDays[0];
  if (!todayDay || !todayKey) {
    return (
      <WorkspacePanel title="جدول اليوم" subtitle="—" className="min-h-0 flex-1">
        <p className="text-ds-body text-muted-foreground">لا توجد بيانات للمنطقة الزمنية.</p>
      </WorkspacePanel>
    );
  }

  const hours = slotsForDay(todayDay).slice().sort((a, b) => a - b);
  const lateN = todayOps.lateItems.length;
  const inN = todayOps.checkedInItems.length;
  const heatOverlay =
    lateN >= 2 || inN >= 3 || (slotMap.get(`${todayKey}-${nowHour}`)?.length ?? 0) >= 3;
  const compact = layoutDensity === "compact";

  return (
    <WorkspacePanel
      title={compact ? "مرجع اليوم" : "جدول اليوم"}
      subtitle={
        compact
          ? `${todayDay.setLocale("ar").toFormat("ccc dd LLL")} · ضيق`
          : `${todayDay.setLocale("ar").toFormat("ccc dd LLL")} · مرجع بصري`
      }
      className="flex min-h-0 min-w-0 flex-col"
      contentClassName="flex min-h-0 flex-col p-cg-0"
    >
      <div
        ref={gridScrollRef}
        className={cn("flex-1 overflow-auto", compact ? "max-h-[min(52vh,520px)]" : "max-h-[min(70vh,920px)]")}
      >
        <div className={cn(compact ? "min-w-[200px] p-cg-2" : "min-w-[320px] p-cg-4")}>
          {heatOverlay ? (
            <div
              className={cn(
                "rounded-xl border border-warning/35 bg-warning/10 text-warning",
                compact ? "mb-cg-2 px-cg-2 py-cg-1.5 text-ds-label" : "mb-cg-3 px-cg-3 py-cg-2 text-ds-small",
              )}
            >
              ضغط مرتفع — راجع الطابور.
            </div>
          ) : null}
          <div className={cn("grid pb-cg-2", compact ? "grid-cols-[40px_1fr] gap-cg-1" : "grid-cols-[52px_1fr] gap-cg-2")}>
            <div />
            <div
              className={cn(
                "rounded-xl bg-primary/10 text-center font-medium text-primary ring-1 ring-primary/20",
                compact ? "py-cg-1 text-ds-label" : "py-cg-2 text-ds-small",
              )}
            >
              اليوم
            </div>
          </div>

          {hours.map((hour) => {
            const key = `${todayKey}-${hour}`;
            const items = slotMap.get(key) ?? [];
            const disabled = !hours.includes(hour);
            const isToday = todayDay.toISODate() === todayKey;
            const isNowCell = isToday && hour === nowHour && !disabled;
            const isPastSlot = isToday && !disabled && hour < nowHour;
            const isNearWindow = isToday && !disabled && (hour === nowHour || hour === nowHour + 1);
            const rowPressure =
              isNearWindow &&
              (items.length >= 2 ||
                items.some((item) => {
                  const sl = toClinicZoned(item.starts_at, clinicTimezone);
                  return (
                    sl != null &&
                    isLateAfterGrace(sl, nowZoned, ARRIVAL_GRACE_MINUTES) &&
                    String(item.status || "").toLowerCase() !== "completed"
                  );
                }));

            return (
              <div
                key={hour}
                className={cn(
                  "relative grid py-cg-1",
                  compact ? "grid-cols-[40px_1fr] gap-cg-1" : "grid-cols-[52px_1fr] gap-cg-2",
                  isNearWindow ? "rounded-xl bg-gradient-to-b from-primary/[0.06] to-transparent" : "",
                )}
              >
                <div
                  className={cn(
                    "flex items-start justify-center text-muted-foreground",
                    compact ? "pt-cg-1 text-ds-label" : "pt-cg-2 text-ds-small",
                  )}
                >
                  <span
                    className={cn(
                      "rounded-md px-cg-1 py-cg-0.5",
                      hour === nowHour ? "bg-primary/10 font-medium text-primary ring-1 ring-primary/25" : "",
                      hour < nowHour ? "opacity-40" : Math.abs(hour - nowHour) >= 4 ? "opacity-55" : "",
                    )}
                  >
                    {`${hour}:00`}
                  </span>
                </div>
                <div
                  className={cn(
                    "relative rounded-xl border border-dashed border-border/70 bg-background/70 transition",
                    compact ? "min-h-11 p-cg-1.5" : "min-h-14 p-cg-2",
                    isPastSlot ? "opacity-[0.38]" : "",
                    isNearWindow && !isPastSlot ? "bg-primary/[0.04]" : "",
                    isNowCell ? "ring-2 ring-primary/25" : "",
                  )}
                >
                  {rowPressure ? (
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-x-1 top-0.5 z-[2] rounded-md bg-warning/15 text-center text-warning",
                        compact ? "px-cg-1 py-cg-0.5 text-[10px] leading-tight" : "inset-x-2 top-1 px-cg-2 py-cg-0.5 text-ds-label",
                      )}
                    >
                      متأخرون
                    </div>
                  ) : null}
                  {isNowCell ? (
                    <div
                      className="pointer-events-none absolute inset-x-2 z-[1] h-[2px] rounded-full bg-primary/75"
                      style={{ top: `calc(${compact ? "0.35rem" : "0.5rem"} + (${nowZoned.minute} / 60) * (100% - ${compact ? "0.7rem" : "1rem"}))` }}
                    />
                  ) : null}
                  <div className={cn("flex flex-col", compact ? "gap-cg-0.5" : "gap-cg-1")}>
                    {items.map((item) => {
                      const startLocal = toClinicZoned(item.starts_at, clinicTimezone);
                      const endLocal = toClinicZoned(item.ends_at, clinicTimezone);
                      if (!startLocal?.isValid) return null;
                      const isEmergency = item.source_channel === "whatsapp_emergency";
                      const pa = computeAppointmentPrimaryAction(item, startLocal, {
                        nowZoned,
                        clinicTimezone,
                        workspaceMode,
                        patchAppointmentOptimistic,
                        sendOperationalToPatient,
                        openPatientConversation,
                      });
                      const tone = appointmentOperationalStyle(item, {
                        isNow: pa.isNow,
                        isLate: pa.late,
                        checkedIn: pa.checkedInUi,
                      });
                      const arrival = arrivalLabel(item.patient_arrival_state);
                      const arrivalRaw = String(item.patient_arrival_state || "").toLowerCase();
                      const proj = todayKey ? projectionById.get(item.id) : undefined;

                      const primaryVariant =
                        pa.primaryLabel === "المحادثة"
                          ? "outline"
                          : pa.primaryLabel === "إنهاء الكشف" || pa.primaryLabel === "استقبال فوري"
                            ? "default"
                            : "secondary";

                      return (
                        <div
                          key={item.id}
                          ref={(node) => {
                            if (!node) apptElByIdRef.current.delete(item.id);
                            else apptElByIdRef.current.set(item.id, node);
                          }}
                          className={cn(
                            "rounded-lg border transition",
                            compact ? "p-cg-1.5" : "p-cg-2",
                            tone.bg,
                            tone.border,
                            tone.effects,
                          )}
                        >
                          <div className="flex items-start justify-between gap-cg-1">
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "line-clamp-1 font-semibold",
                                  compact ? "text-ds-label" : "text-ds-small",
                                )}
                              >
                                {item.patient_display_name ?? `#${item.patient_id ?? "?"}`}
                              </p>
                              <p className="line-clamp-1 text-ds-label text-muted-foreground">{item.doctor_name ?? "طبيب"}</p>
                            </div>
                            <span className={cn("shrink-0 rounded px-cg-1 py-cg-0.5 text-ds-label", tone.text)}>
                              {timeLabel(startLocal)}–{timeLabel(endLocal)}
                            </span>
                          </div>
                          {proj ? (
                            <p className="mt-cg-1 text-ds-label text-muted-foreground">
                              {proj.bucket === "NOW" ? (
                                <>كشف جارٍ · نهاية متوقعة {proj.projected_end.setLocale("ar").toFormat("HH:mm")}</>
                              ) : (
                                <>متوقع البدء {proj.projected_start.setLocale("ar").toFormat("HH:mm")}</>
                              )}
                            </p>
                          ) : null}
                          {pa.isNow || pa.late ? (
                            <p className={cn("mt-cg-0.5 text-ds-label", pa.late ? "text-warning" : "text-primary")}>
                              {startLocal ? relativeWindowLabel(nowZoned, startLocal) : null}
                            </p>
                          ) : null}
                          <div className="mt-cg-2 flex flex-wrap items-center gap-cg-1">
                            {isEmergency ? <Badge variant="danger">طوارئ</Badge> : null}
                            {pa.late ? <Badge variant="warning">متأخر</Badge> : null}
                            {arrival ? (
                              <Badge variant={arrivalRaw === "checked_in" ? "success" : "secondary"}>{arrival}</Badge>
                            ) : null}
                            <Badge variant="outline" className="font-normal text-muted-foreground">
                              {statusLabel(item.status)}
                            </Badge>
                            {pa.showPrimary ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={primaryVariant}
                                className="shrink-0"
                                disabled={
                                  isApptBusy(item.id) || (hardOperationalLock && !isEmergency)
                                }
                                onClick={pa.onPrimary}
                              >
                                {pa.primaryLabel}
                              </Button>
                            ) : null}
                          </div>
                          {!isDoctorMode && pa.inReminderWindow && item.patient_id ? (
                            <p className="mt-cg-1 text-ds-label text-info">نافذة التذكير قبل الموعد</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </WorkspacePanel>
  );
}
