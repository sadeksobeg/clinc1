"use client";

import { useMemo, useRef } from "react";
import { DateTime } from "luxon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";
import { cn } from "@/lib/utils";
import { toClinicZoned } from "@/lib/format";
import { statusLabel } from "@/lib/i18n/status";
import type { AppointmentRow } from "@/lib/ops-server";
import type { WorkspaceMode } from "@/hooks/use-ui-preferences";
import {
  appointmentIsActiveNow,
  appointmentOperationalStyle,
  arrivalLabel,
  timeLabel,
  type ClinicDayOperationsResult,
} from "@/features/appointments/use-clinic-day-operations";
import { ARRIVAL_GRACE_MINUTES } from "@/lib/clinic-message-templates";
import { isLateAfterGrace } from "@/lib/clinic-time";
import { computeAppointmentPrimaryAction } from "@/features/operations/appointment-row-actions";

const ROW_H_DEFAULT = 44;
const ROW_H_FOOTER = 22;

type Props = {
  ops: ClinicDayOperationsResult;
  clinicTimezone: string;
  doctorFilter: string;
  appointmentsForFilter: AppointmentRow[];
  workspaceMode: WorkspaceMode;
  selectedAppointmentId?: number | null;
  onSelectAppointment?: (id: number | null) => void;
  /** مرجع بصري فقط: صفوف أرفع، بدون أزرار على الكتل */
  variant?: "default" | "footer";
  className?: string;
  /** طبقة انتباه: تخفيف الكتل ما عدا المحدد/المستهدف */
  attentionLayerMuted?: boolean;
};

function durationMinutes(start: DateTime, end: DateTime | null): number {
  if (!end?.isValid) return 20;
  const m = Math.round(end.diff(start, "minutes").minutes);
  return Number.isFinite(m) && m >= 5 ? Math.min(m, 240) : 20;
}

/** موضع خط عمودي (0–1) داخل منطقة الساعات لنقطة زمنية في نفس يوم todayKey. */
function timelineVerticalFraction(args: {
  hours: number[];
  point: DateTime;
  todayDay: DateTime;
  todayKey: string;
  rowH: number;
}): number | null {
  const { hours, point, todayDay, todayKey, rowH } = args;
  if (!todayDay || !todayKey || hours.length === 0) return null;
  if (todayDay.toISODate() !== todayKey) return null;
  if (point.toISODate() !== todayKey) return null;
  const totalRows = hours.length;
  const totalPx = totalRows * rowH;
  const idx = hours.indexOf(point.hour);
  let topPx: number;
  if (idx >= 0) {
    topPx = (idx + point.minute / 60) * rowH;
  } else if (point.hour < hours[0]!) {
    topPx = 0;
  } else if (point.hour > hours[hours.length - 1]!) {
    topPx = totalPx;
  } else {
    let after = hours.findIndex((h) => h > point.hour);
    if (after <= 0) after = 1;
    const before = hours[after - 1] ?? hours[0]!;
    const gap = (hours[after]! - before) * 60;
    const into = (point.hour - before) * 60 + point.minute;
    topPx = ((after - 1) + Math.min(1, Math.max(0, into / gap))) * rowH;
  }
  return Math.min(1, Math.max(0, topPx / totalPx));
}

export function ClinicOperationalTimeline({
  ops,
  clinicTimezone,
  doctorFilter,
  appointmentsForFilter,
  workspaceMode,
  selectedAppointmentId = null,
  onSelectAppointment,
  variant = "default",
  className,
  attentionLayerMuted = false,
}: Props) {
  const isFooter = variant === "footer";
  const ROW_H = isFooter ? ROW_H_FOOTER : ROW_H_DEFAULT;

  const {
    calendarDays,
    slotsForDay,
    todayKey,
    nowZoned,
    apptElByIdRef,
    isApptBusy,
    patchAppointmentOptimistic,
    sendOperationalToPatient,
    openPatientConversation,
    hardOperationalLock,
    primaryOperationalSuggestion,
    activeOperationalSessionAppointmentId,
    enrichedProjectionById,
  } = ops;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    if (doctorFilter === "all") return appointmentsForFilter;
    return appointmentsForFilter.filter((r) => r.doctor_name === doctorFilter);
  }, [appointmentsForFilter, doctorFilter]);

  const todayDay = calendarDays[0];
  const hours = useMemo(() => {
    if (!todayDay) return [] as number[];
    return slotsForDay(todayDay)
      .slice()
      .sort((a, b) => a - b);
  }, [todayDay, slotsForDay]);

  const byHour = useMemo(() => {
    const m = new Map<number, AppointmentRow[]>();
    if (!todayKey) return m;
    for (const appt of filtered) {
      const local = toClinicZoned(appt.starts_at, clinicTimezone);
      if (!local || local.toISODate() !== todayKey) continue;
      const h = local.hour;
      if (!m.has(h)) m.set(h, []);
      m.get(h)!.push(appt);
    }
    m.forEach((list) => {
      list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    });
    return m;
  }, [filtered, clinicTimezone, todayKey]);

  const nowLineFrac = useMemo(() => {
    if (!todayDay || !todayKey || hours.length === 0) return null;
    return timelineVerticalFraction({ hours, point: nowZoned, todayDay, todayKey, rowH: ROW_H });
  }, [hours, nowZoned, todayDay, todayKey, ROW_H]);

  const plus30LineFrac = useMemo(() => {
    if (!isFooter || !todayDay || !todayKey || hours.length === 0) return null;
    return timelineVerticalFraction({
      hours,
      point: nowZoned.plus({ minutes: 30 }),
      todayDay,
      todayKey,
      rowH: ROW_H,
    });
  }, [hours, nowZoned, todayDay, todayKey, ROW_H, isFooter]);

  if (!todayDay || !todayKey) {
    return (
      <WorkspacePanel title="الخط الزمني" subtitle="—" className="min-h-0 flex-1">
        <p className="p-cg-4 text-ds-body text-muted-foreground">لا توجد بيانات للمنطقة الزمنية.</p>
      </WorkspacePanel>
    );
  }

  const primaryId = primaryOperationalSuggestion?.appointment_id ?? null;
  const timelineFocusAppointmentId = activeOperationalSessionAppointmentId ?? primaryId;

  return (
    <WorkspacePanel
      title={isFooter ? "خريطة اليوم" : "الخط الزمني التشغيلي"}
      subtitle={
        isFooter
          ? "مرجع بصري — خط «الآن» و«+٣٠ د» للتوقع، التنفيذ من الطابور"
          : `${todayDay.setLocale("ar").toFormat("ccc dd LLL")} · كتل مدة · تدفّق التشغيل ←`
      }
      className={cn("flex min-h-0 min-w-0 flex-col", isFooter && "h-full min-h-0", className)}
      contentClassName={cn(
        "flex min-h-0 flex-col p-cg-0",
        isFooter && "min-h-0 flex-1 overflow-hidden",
      )}
    >
      <div
        ref={scrollRef}
        className={cn(
          "overflow-auto",
          isFooter ? "min-h-0 flex-1" : "max-h-[min(52vh,560px)] flex-1",
        )}
      >
        <div className={cn("p-cg-2", isFooter && "opacity-[0.42]")}>
          <div className="relative" style={{ minHeight: hours.length * ROW_H }}>
            {nowLineFrac != null ? (
              <div className="pointer-events-none absolute start-10 end-2 top-0 z-20 h-full">
                <div
                  className={cn(
                    "absolute start-0 end-0 h-0.5 rounded-full shadow-sm",
                    isFooter
                      ? "bg-muted-foreground/45 ring-1 ring-muted-foreground/20"
                      : "bg-primary ring-2 ring-primary/25",
                  )}
                  style={{ top: `${nowLineFrac * 100}%`, transform: "translateY(-50%)" }}
                  aria-hidden
                />
                {isFooter && plus30LineFrac != null ? (
                  <>
                    <div
                      className="absolute start-0 end-0 z-10 border-t border-dashed border-muted-foreground/55"
                      style={{ top: `${plus30LineFrac * 100}%`, transform: "translateY(-50%)" }}
                      title="توقّع موضع الجدول بعد حوالي ٣٠ دقيقة"
                      aria-hidden
                    />
                    <span
                      className="absolute z-10 rounded bg-muted/90 px-1 py-0.5 text-[9px] font-medium text-muted-foreground shadow-sm"
                      style={{
                        top: `${plus30LineFrac * 100}%`,
                        transform: "translateY(-130%)",
                        insetInlineEnd: "0.25rem",
                      }}
                    >
                      +٣٠ د
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}

            {hours.map((hour) => {
              const items = byHour.get(hour) ?? [];
              const isToday = todayDay.toISODate() === todayKey;
              const isNowRow = isToday && hour === nowZoned.hour;

              return (
                <div
                  key={hour}
                  className="flex gap-cg-2 border-b border-border/40 last:border-b-0"
                  style={{ height: ROW_H }}
                >
                  <div
                    className={cn(
                      "flex shrink-0 items-center justify-center text-muted-foreground",
                      isFooter ? "w-7 text-[10px]" : "w-9 text-ds-label",
                      isNowRow && "font-semibold text-primary",
                    )}
                  >
                    {`${hour}:00`}
                  </div>
                  <div className="relative flex-1 rounded-lg bg-muted/15 py-cg-0.5 pe-cg-1 ps-cg-1">
                    <div className="relative h-full">
                      {items.map((item) => {
                        const startLocal = toClinicZoned(item.starts_at, clinicTimezone);
                        const endLocal = toClinicZoned(item.ends_at, clinicTimezone);
                        if (!startLocal?.isValid) return null;
                        const startMin = startLocal.minute + startLocal.second / 60;
                        const dur = durationMinutes(startLocal, endLocal);
                        const inHourMin = Math.max(0, 60 - startMin);
                        const barMin = Math.min(dur, inHourMin);
                        const leftPct = (startMin / 60) * 100;
                        const widthPct = (barMin / 60) * 100;

                        const isEmergency = item.source_channel === "whatsapp_emergency";
                        const statusRaw = String(item.status || "").toLowerCase();
                        const arrivalRaw = String(item.patient_arrival_state || "").toLowerCase();
                        const isNow =
                          startLocal != null &&
                          endLocal != null &&
                          appointmentIsActiveNow(item, nowZoned, startLocal, endLocal);
                        const late =
                          !isEmergency &&
                          statusRaw !== "cancelled" &&
                          statusRaw !== "completed" &&
                          isLateAfterGrace(startLocal, nowZoned, ARRIVAL_GRACE_MINUTES);
                        const checkedInUi =
                          arrivalRaw === "checked_in" && statusRaw !== "cancelled" && statusRaw !== "completed";
                        const tone = appointmentOperationalStyle(item, {
                          isNow: Boolean(isNow),
                          isLate: late,
                          checkedIn: checkedInUi,
                        });

                        const pa = computeAppointmentPrimaryAction(item, startLocal, {
                          nowZoned,
                          clinicTimezone,
                          workspaceMode,
                          patchAppointmentOptimistic,
                          sendOperationalToPatient,
                          openPatientConversation,
                        });

                        const primaryLocked = hardOperationalLock && !isEmergency;
                        const selected = selectedAppointmentId === item.id;
                        const brainPick = timelineFocusAppointmentId === item.id;
                        const enriched = enrichedProjectionById.get(item.id);
                        const delayMin = enriched?.delay_minutes ?? 0;
                        const delayOverlay =
                          delayMin > 20 ? "bg-destructive/30" : delayMin > 10 ? "bg-warning/25" : "";
                        const risk = enriched?.risk_level;
                        const conf = enriched?.confidence;
                        const baseBlockOpacity =
                          conf != null && Number.isFinite(conf)
                            ? Math.min(1, Math.max(0.56, conf / 100))
                            : 0.9;
                        const blockOpacity =
                          attentionLayerMuted && isFooter && !brainPick && !selected
                            ? baseBlockOpacity * 0.82
                            : baseBlockOpacity;
                        const trustTitle = [
                          enriched != null ? `ثقة إسقاط الجدول ~${Math.round(enriched.confidence)}٪` : "بدون إسقاط",
                          `تأخير تشغيلي ~${Math.round(delayMin)} د`,
                          risk === "high" ? "مخاطر عالية" : risk === "medium" ? "مراقبة مخاطر" : "",
                        ]
                          .filter(Boolean)
                          .join(" — ");

                        return (
                          <div
                            key={item.id}
                            ref={(node) => {
                              if (!node) apptElByIdRef.current.delete(item.id);
                              else apptElByIdRef.current.set(item.id, node);
                            }}
                            role={onSelectAppointment ? "button" : undefined}
                            tabIndex={onSelectAppointment ? 0 : undefined}
                            onClick={() => onSelectAppointment?.(item.id)}
                            onKeyDown={(e) => {
                              if (!onSelectAppointment) return;
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelectAppointment(item.id);
                              }
                            }}
                            title={trustTitle}
                            className={cn(
                              "absolute top-1/2 flex -translate-y-1/2 cursor-pointer flex-col justify-center overflow-hidden rounded-md border px-cg-1.5 py-cg-0.5 text-start shadow-sm transition",
                              tone.bg,
                              tone.border,
                              delayMin > 20 && "border-destructive/55",
                              delayMin > 10 && delayMin <= 20 && "border-warning/50",
                              selected && "ring-2 ring-primary/55",
                              brainPick && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                              onSelectAppointment && "hover:brightness-[1.02]",
                            )}
                            style={{
                              insetInlineStart: `${leftPct}%`,
                              width: `${Math.max(widthPct, 6)}%`,
                              minHeight: isFooter ? 18 : 28,
                              opacity: blockOpacity,
                            }}
                          >
                            <div className="relative z-0 flex min-h-0 w-full flex-col justify-center">
                              {delayOverlay ? (
                                <div
                                  className={cn(
                                    "pointer-events-none absolute inset-0 z-[1] rounded-md",
                                    delayOverlay,
                                  )}
                                  aria-hidden
                                />
                              ) : null}
                              {risk === "high" ? (
                                <span
                                  className="absolute end-0.5 top-0.5 z-[2] text-[10px] leading-none"
                                  title="مخاطر عالية"
                                  aria-label="مخاطر عالية"
                                >
                                  🔴
                                </span>
                              ) : risk === "medium" ? (
                                <span
                                  className="absolute end-0.5 top-0.5 z-[2] text-[10px] leading-none"
                                  title="مراقبة"
                                  aria-label="مراقبة"
                                >
                                  ⚠️
                                </span>
                              ) : null}
                              <span
                                className={cn(
                                  "relative z-[2] line-clamp-1 font-semibold leading-tight",
                                  isFooter ? "text-[10px]" : "text-ds-label",
                                )}
                              >
                                {item.patient_display_name ?? "مريض"}
                              </span>
                              <span className="relative z-[2] line-clamp-1 font-mono text-[10px] text-muted-foreground">
                                {timeLabel(startLocal)}
                                {!isFooter ? ` · ${dur}د` : null}
                              </span>
                              <div
                                className="relative z-[2] mt-cg-0.5 flex flex-wrap items-center gap-cg-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                              {isEmergency ? (
                                <Badge variant="danger" className="px-1 py-0 text-[10px]">
                                  طوارئ
                                </Badge>
                              ) : null}
                              {late ? (
                                <Badge variant="warning" className="px-1 py-0 text-[10px]">
                                  متأخر
                                </Badge>
                              ) : null}
                              {arrivalLabel(item.patient_arrival_state) ? (
                                <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal">
                                  {arrivalLabel(item.patient_arrival_state)}
                                </Badge>
                              ) : null}
                            </div>
                            {!isFooter && pa.showPrimary ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={pa.primaryLabel === "إنهاء الكشف" || pa.primaryLabel === "استقبال فوري" ? "default" : "secondary"}
                                className="relative z-[2] mt-cg-1 h-7 w-full min-w-0 px-1 text-[11px]"
                                disabled={isApptBusy(item.id) || primaryLocked}
                                onClick={pa.onPrimary}
                              >
                                {pa.primaryLabel}
                              </Button>
                            ) : null}
                            <span className="relative z-[2] sr-only">{statusLabel(item.status)}</span>
                            </div>
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
      </div>
    </WorkspacePanel>
  );
}
