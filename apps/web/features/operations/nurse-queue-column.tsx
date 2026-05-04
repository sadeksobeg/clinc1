"use client";

import { useMemo } from "react";
import { DateTime } from "luxon";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";
import { cn } from "@/lib/utils";
import { toClinicZoned } from "@/lib/format";
import {
  delayAlertOperationalText,
  noShowFollowupText,
  reminderBeforeAppointmentText,
} from "@/lib/clinic-message-templates";
import { statusLabel } from "@/lib/i18n/status";
import type { AppointmentRow } from "@/lib/ops-server";
import type { WorkspaceMode } from "@/hooks/use-ui-preferences";
import { relativeWindowLabel, timeLabel, type ClinicDayOperationsResult, type OpsRow } from "@/features/appointments/use-clinic-day-operations";
import { canPerformAction } from "@/lib/clinic-brain/permissions";
import { computeAppointmentPrimaryAction } from "@/features/operations/appointment-row-actions";
import { QueueDecisionLeadRow } from "@/features/operations/queue-decision-lead-row";

const SLA_LATE_MINUTES = 15;

function minutesLate(now: DateTime, start: DateTime): number {
  return Math.round(now.diff(start, "minutes").minutes);
}

type QueueSection = {
  key: string;
  bandLabel: string;
  tone: "danger" | "warning" | "success" | "muted";
  rows: OpsRow[];
};

type QueueStreamTone = QueueSection["tone"];

function streamPriorityLabel(tone: QueueStreamTone, a: AppointmentRow): string {
  if (a.source_channel === "whatsapp_emergency") return "طوارئ";
  switch (tone) {
    case "danger":
      return "طوارئ";
    case "warning":
      return "متأخر";
    case "success":
      return "داخل";
    case "muted":
      return "قادم";
    default:
      return "—";
  }
}

function streamPriorityGlyph(tone: QueueStreamTone, a: AppointmentRow): string {
  if (a.source_channel === "whatsapp_emergency" || tone === "danger") return "🔴";
  if (tone === "warning") return "🟠";
  if (tone === "success") return "🟢";
  return "⚪";
}

function QueueRowActionBar({
  row,
  ops,
  clinicTimezone,
  workspaceMode,
  isDoctorMode,
}: {
  row: OpsRow;
  ops: ClinicDayOperationsResult;
  clinicTimezone: string;
  workspaceMode: WorkspaceMode;
  isDoctorMode: boolean;
}) {
  const { a, st } = row;
  const {
    nowZoned,
    isApptBusy,
    patchAppointmentOptimistic,
    sendOperationalToPatient,
    openPatientConversation,
    moveAppointment,
    etaMinutesFor,
    hardOperationalLock,
    guidedOperationalLimit,
  } = ops;

  const p = computeAppointmentPrimaryAction(a, st, {
    nowZoned,
    clinicTimezone,
    workspaceMode,
    patchAppointmentOptimistic,
    sendOperationalToPatient,
    openPatientConversation,
  });
  const lateMins = p.startLocal ? minutesLate(nowZoned, p.startLocal) : 0;
  const slaBad = p.late && lateMins >= SLA_LATE_MINUTES;
  const isEmergency = a.source_channel === "whatsapp_emergency";
  const hideRowActions = ops.decisionGateActive && !isEmergency;
  const guidedExecutionRail = ops.guidedOperationalLimit && !isEmergency;

  if (hideRowActions) {
    return (
      <div
        className="flex w-[4.5rem] shrink-0 items-center justify-end text-ds-label text-muted-foreground"
        aria-hidden
      >
        —
      </div>
    );
  }

  const primaryLocked = ops.hardOperationalLock && !isEmergency;
  const moreLocked = ops.hardOperationalLock && !isEmergency;
  const hidePrimaryForGuided = guidedExecutionRail;

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-cg-1" onClick={(e) => e.stopPropagation()}>
      {!hidePrimaryForGuided && p.showPrimary ? (
        <Button
          type="button"
          size="sm"
          variant={p.primaryLabel === "إنهاء الكشف" || p.primaryLabel === "استقبال فوري" ? "default" : "secondary"}
          disabled={isApptBusy(a.id) || primaryLocked}
          onClick={p.onPrimary}
        >
          {p.primaryLabel}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-cg-1 px-cg-2 text-muted-foreground"
            disabled={moreLocked}
          >
            <MoreHorizontal className="size-4" />
            <span className="hidden sm:inline">المزيد</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[13rem]">
          {p.arrivalRaw !== "late" ? (
            <DropdownMenuItem
              onClick={() =>
                void patchAppointmentOptimistic(a.id, { patient_arrival_state: "late" }, "تعليم كمريض متأخر", {
                  source: "ui_surface",
                })
              }
            >
              تأخير
            </DropdownMenuItem>
          ) : null}
          {canPerformAction("no_show", a, { isNow: p.isNow }).allowed ? (
            <DropdownMenuItem
              onClick={() =>
                void patchAppointmentOptimistic(
                  a.id,
                  { status: "no_show", patient_arrival_state: "no_show" },
                  "تعليم كلم يحضر",
                  {
                    source: "ui_surface",
                    afterSuccess: async () => {
                      const pid = a.patient_id;
                      if (!pid) return;
                      await sendOperationalToPatient(pid, noShowFollowupText(), "متابعة الغياب", {
                        type: "no_show_followup",
                        appointmentId: a.id,
                      });
                    },
                  },
                )
              }
            >
              لم يحضر
            </DropdownMenuItem>
          ) : null}
          {a.patient_id ? (
            <DropdownMenuItem onClick={() => void openPatientConversation(a.patient_id!)}>محادثة</DropdownMenuItem>
          ) : null}
          {!isDoctorMode && p.inReminderWindow && a.patient_id ? (
            <DropdownMenuItem
              onClick={() =>
                void sendOperationalToPatient(
                  a.patient_id!,
                  reminderBeforeAppointmentText({ etaMinutes: etaMinutesFor(a.id) }),
                  "التذكير",
                  { type: "reminder", appointmentId: a.id },
                )
              }
            >
              إرسال تذكير
            </DropdownMenuItem>
          ) : null}
          {!isDoctorMode && a.patient_id ? (
            <DropdownMenuItem
              onClick={() =>
                void sendOperationalToPatient(
                  a.patient_id!,
                  delayAlertOperationalText({ etaMinutes: etaMinutesFor(a.id) }),
                  "تنبيه التأخير",
                  { type: "delay", appointmentId: a.id },
                )
              }
            >
              تنبيه تأخير
            </DropdownMenuItem>
          ) : null}
          {slaBad ? (
            <DropdownMenuItem
              onClick={() => {
                const z = String(clinicTimezone || "UTC");
                const base = DateTime.fromISO(a.starts_at, { zone: "utc" }).setZone(z);
                const nextH = Math.min(nowZoned.hour + 1, 20);
                void moveAppointment(a.id, base.toJSDate(), nextH);
              }}
            >
              إعادة جدولة (+ساعة تقريبًا)
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type Props = {
  ops: ClinicDayOperationsResult;
  clinicTimezone: string;
  workspaceMode: WorkspaceMode;
  selectedAppointmentId?: number | null;
  onSelectAppointment?: (id: number | null) => void;
  presentation?: "cards" | "list";
  /** وضع صارم: يقيّد التفاعل مع الطابور حتى يُنفَّذ القرار أو يُتجاهَل */
  queueInteractionLocked?: boolean;
  /** تمييز موعد توصية Brain كهدف تشغيلي واحد */
  operationalFocusId?: number | null;
  /** طبقة انتباه: خفض تباين الطابور ليبرز صف «الآن» */
  attentionLayerMuted?: boolean;
  /** دمج توصية التشغيل كصف أول في قائمة الطابور */
  embedDecisionInQueue?: boolean;
};

export function NurseQueueColumn({
  ops,
  clinicTimezone,
  workspaceMode,
  selectedAppointmentId = null,
  onSelectAppointment,
  presentation = "cards",
  queueInteractionLocked = false,
  operationalFocusId = null,
  attentionLayerMuted = false,
  embedDecisionInQueue: embedDecisionInQueueProp,
}: Props) {
  const {
    todayOps,
    todayTimeline,
    nowZoned,
    projectionById,
    patchAppointmentOptimistic,
    sendOperationalToPatient,
    openPatientConversation,
    etaMinutesFor,
    slaSuggestions,
    hardOperationalLock,
    apptElByIdRef,
    appointments,
    enrichedProjectionById,
    primaryOperationalSuggestion,
    activeOperationalSession,
    decisionGateActive,
    decisionDismissed,
  } = ops;

  const queueSections = useMemo((): QueueSection[] => {
    const sections: QueueSection[] = [];
    if (todayOps.emergencies.length) {
      sections.push({ key: "em", bandLabel: "🔥 طوارئ", tone: "danger", rows: [...todayOps.emergencies] });
    }
    if (todayOps.lateItems.length) {
      sections.push({ key: "late", bandLabel: "⚠️ متأخرون", tone: "warning", rows: [...todayOps.lateItems] });
    }
    if (todayOps.checkedInItems.length) {
      sections.push({
        key: "in",
        bandLabel: "🟢 داخل العيادة",
        tone: "success",
        rows: [...todayOps.checkedInItems],
      });
    }
    if (todayOps.upcomingItems.length) {
      sections.push({
        key: "up",
        bandLabel: "📅 قادم",
        tone: "muted",
        rows: todayOps.upcomingItems.slice(0, 16),
      });
    }
    return sections;
  }, [todayOps]);

  const queueStreamSignature = useMemo(
    () => queueSections.map((s) => `${s.key}:${s.rows.map(({ a }) => a.id).join(",")}`).join("|"),
    [queueSections],
  );

  const flatQueueRows = useMemo(() => {
    const out: { row: OpsRow; tone: QueueSection["tone"] }[] = [];
    for (const sec of queueSections) {
      for (const row of sec.rows) out.push({ row, tone: sec.tone });
    }
    return out;
  }, [queueSections, queueStreamSignature]);

  const smartEmptyHint = useMemo(() => {
    const next = todayTimeline.next;
    const lastDone = [...appointments]
      .filter((a) => String(a.status || "").toLowerCase() === "completed")
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0];
    const nextStart = next ? toClinicZoned(next.starts_at, clinicTimezone) : null;
    return {
      nextName: next?.patient_display_name ?? null,
      nextAt: nextStart?.isValid ? nextStart.setLocale("ar").toFormat("HH:mm") : null,
      lastName: lastDone?.patient_display_name ?? null,
      lastAt: lastDone ? toClinicZoned(lastDone.starts_at, clinicTimezone) : null,
    };
  }, [appointments, todayTimeline.next, clinicTimezone]);

  const slaHeavyDelayIds = useMemo(() => {
    const ids = new Set<number>();
    for (const s of slaSuggestions) {
      if (s.kind === "send_delay_message" && (s.metrics.delay_minutes ?? 0) > 20) {
        ids.add(s.appointment_id);
      }
    }
    return ids;
  }, [slaSuggestions]);

  const isDoctorMode = workspaceMode === "doctor";
  const nextConflict = Boolean(
    todayTimeline.serveNext &&
      todayTimeline.calendarNext &&
      todayTimeline.serveNext.id !== todayTimeline.calendarNext.id,
  );

  const isList = presentation === "list";
  const embedDecisionInQueue =
    embedDecisionInQueueProp !== undefined ? embedDecisionInQueueProp : isList;

  const hasOperationalLead =
    embedDecisionInQueue &&
    isList &&
    !decisionDismissed &&
    (primaryOperationalSuggestion != null || activeOperationalSession != null);

  const listStreamRows = useMemo(() => {
    if (!hasOperationalLead) return flatQueueRows;
    const leadApptId =
      activeOperationalSession?.appointmentId ?? primaryOperationalSuggestion?.appointment_id ?? null;
    if (primaryOperationalSuggestion?.action === "call_next" && leadApptId != null) {
      return flatQueueRows.filter(({ row }) => row.a.id !== leadApptId);
    }
    return flatQueueRows;
  }, [flatQueueRows, hasOperationalLead, primaryOperationalSuggestion, activeOperationalSession]);

  function listStatusSubtitle(a: AppointmentRow, st: DateTime, p: ReturnType<typeof computeAppointmentPrimaryAction>) {
    const lateMins = p.startLocal ? minutesLate(nowZoned, p.startLocal) : 0;
    const slaBad = p.late && lateMins >= SLA_LATE_MINUTES;
    if (slaBad && lateMins > 0) return `متأخر ${lateMins} د`;
    const eta = etaMinutesFor(a.id);
    if (eta != null && eta > 0) return `ETA: بعد ~${eta} د`;
    return relativeWindowLabel(nowZoned, st) ?? "—";
  }

  function renderCard(row: OpsRow, tone: "danger" | "warning" | "success" | "muted") {
    const { a, st } = row;
    const p = computeAppointmentPrimaryAction(a, st, {
      nowZoned,
      clinicTimezone,
      workspaceMode,
      patchAppointmentOptimistic,
      sendOperationalToPatient,
      openPatientConversation,
    });
    const proj = projectionById.get(a.id);
    const lateMins = p.startLocal ? minutesLate(nowZoned, p.startLocal) : 0;
    const slaBad = p.late && lateMins >= SLA_LATE_MINUTES;
    const isEmergency = a.source_channel === "whatsapp_emergency";
    const priorityGlow = isEmergency
      ? "ring-2 ring-danger/65 shadow-[0_0_26px_-6px] shadow-danger/35 clinic-motion clinic-ops-emergency"
      : slaHeavyDelayIds.has(a.id) || (slaBad && lateMins > 20)
        ? "ring-2 ring-warning/55 shadow-[0_0_22px_-8px] shadow-warning/30 clinic-motion clinic-ops-late-halo relative z-[1]"
        : "";

    const border =
      tone === "danger"
        ? "border-danger/55 bg-danger/[0.07]"
        : tone === "warning"
          ? "border-warning/50 bg-warning/[0.06]"
          : tone === "success"
            ? "border-success/45 bg-success/[0.05]"
            : "border-border/70 bg-muted/30";

    const selected = selectedAppointmentId === a.id;

    return (
      <div
        key={a.id}
        role={onSelectAppointment ? "button" : undefined}
        tabIndex={onSelectAppointment ? 0 : undefined}
        onClick={() => onSelectAppointment?.(a.id)}
        onKeyDown={(e) => {
          if (!onSelectAppointment) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectAppointment(a.id);
          }
        }}
        ref={(node) => {
          if (!node) apptElByIdRef.current.delete(a.id);
          else apptElByIdRef.current.set(a.id, node);
        }}
        className={cn(
          "rounded-xl border p-cg-3",
          border,
          priorityGlow,
          onSelectAppointment && "cursor-pointer transition hover:bg-muted/30",
          selected && "ring-2 ring-primary/50",
        )}
      >
        <div className="flex items-start justify-between gap-cg-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{a.patient_display_name ?? "مريض"}</p>
            <p className="truncate text-ds-small text-muted-foreground">{a.doctor_name ?? "بدون طبيب"}</p>
          </div>
          <span className="shrink-0 font-mono text-ds-small">{timeLabel(st)}</span>
        </div>
        <p className="mt-cg-1 text-ds-label text-muted-foreground">{relativeWindowLabel(nowZoned, st) ?? "—"}</p>
        {proj ? (
          <p className="mt-cg-0.5 text-ds-label text-primary/90">
            {proj.bucket === "NOW"
              ? `كشف جارٍ · نهاية متوقعة ${proj.projected_end.setLocale("ar").toFormat("HH:mm")}`
              : `متوقع البدء ${proj.projected_start.setLocale("ar").toFormat("HH:mm")}`}
          </p>
        ) : null}
        <div className="mt-cg-2 flex flex-wrap items-center gap-cg-1">
          <Badge variant="outline" className="font-normal">
            {statusLabel(a.status)}
          </Badge>
          {slaBad ? (
            <Badge variant="danger" className="text-ds-label">
              تأخر {lateMins} د
            </Badge>
          ) : null}
        </div>
        <div className="mt-cg-2">
          <QueueRowActionBar
            row={row}
            ops={ops}
            clinicTimezone={clinicTimezone}
            workspaceMode={workspaceMode}
            isDoctorMode={isDoctorMode}
          />
        </div>
      </div>
    );
  }

  function renderListRow(row: OpsRow, tone: "danger" | "warning" | "success" | "muted", queuePosition: number) {
    const { a, st } = row;
    const enr = enrichedProjectionById.get(a.id);
    const p = computeAppointmentPrimaryAction(a, st, {
      nowZoned,
      clinicTimezone,
      workspaceMode,
      patchAppointmentOptimistic,
      sendOperationalToPatient,
      openPatientConversation,
    });
    const lateMins = p.startLocal ? minutesLate(nowZoned, p.startLocal) : 0;
    const slaBad = p.late && lateMins >= SLA_LATE_MINUTES;
    const isEmergency = a.source_channel === "whatsapp_emergency";
    const priorityGlow = isEmergency
      ? attentionLayerMuted
        ? "ring-1 ring-danger/35 shadow-none"
        : "ring-1 ring-danger/50 shadow-sm shadow-danger/20"
      : slaHeavyDelayIds.has(a.id) || (slaBad && lateMins > 20)
        ? attentionLayerMuted
          ? "ring-1 ring-warning/30"
          : "ring-1 ring-warning/45"
        : "";

    const accentMuted = attentionLayerMuted;
    const accent =
      tone === "danger"
        ? accentMuted
          ? "border-s-danger/45 bg-danger/[0.025]"
          : "border-s-danger/70 bg-danger/[0.04]"
        : tone === "warning"
          ? accentMuted
            ? "border-s-warning/42 bg-warning/[0.03]"
            : "border-s-warning/65 bg-warning/[0.05]"
          : tone === "success"
            ? accentMuted
              ? "border-s-success/40 bg-success/[0.025]"
              : "border-s-success/60 bg-success/[0.04]"
            : accentMuted
              ? "border-s-border/60 bg-muted/12"
              : "border-s-border bg-muted/20";

    const selected = selectedAppointmentId === a.id;
    const isOpFocus = operationalFocusId != null && operationalFocusId === a.id;
    const leadApptForQueue =
      activeOperationalSession?.appointmentId ?? primaryOperationalSuggestion?.appointment_id ?? null;
    const showExecutionRailHint =
      operationalFocusId != null &&
      a.id === operationalFocusId &&
      leadApptForQueue === a.id &&
      (primaryOperationalSuggestion?.action === "call_next" || activeOperationalSession != null);
    const slotHint = enr?.expected_end?.isValid
      ? `حتى ${enr.expected_end.setLocale("ar").toFormat("HH:mm")}`
      : null;
    const subtitle = [listStatusSubtitle(a, st, p), slotHint, a.doctor_name].filter(Boolean).join(" · ");
    const prioLabel = streamPriorityLabel(tone, a);
    const prioGlyph = streamPriorityGlyph(tone, a);
    const prioVariant =
      isEmergency || tone === "danger"
        ? ("danger" as const)
        : tone === "warning"
          ? ("warning" as const)
          : tone === "success"
            ? ("success" as const)
            : ("outline" as const);

    const isFlowHead =
      isOpFocus &&
      leadApptForQueue === a.id &&
      (primaryOperationalSuggestion?.action === "call_next" || activeOperationalSession != null);

    return (
      <div
        key={a.id}
        role={onSelectAppointment ? "button" : undefined}
        tabIndex={onSelectAppointment ? 0 : undefined}
        onClick={() => onSelectAppointment?.(a.id)}
        onKeyDown={(e) => {
          if (!onSelectAppointment) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectAppointment(a.id);
          }
        }}
        ref={(node) => {
          if (!node) apptElByIdRef.current.delete(a.id);
          else apptElByIdRef.current.set(a.id, node);
        }}
        className={cn(
          "flex items-stretch gap-cg-2 py-cg-2 ps-cg-2 pe-cg-1",
          "border-s-4",
          "transition-[background-color,box-shadow,transform] duration-150 ease-out motion-reduce:transition-none",
          accent,
          priorityGlow,
          onSelectAppointment && "cursor-pointer transition hover:bg-muted/35",
          selected && "bg-primary/[0.06] ring-1 ring-inset ring-primary/35",
          isOpFocus && "ring-2 ring-primary/70 ring-offset-1 ring-offset-background",
          showExecutionRailHint && decisionGateActive && "bg-primary/[0.07]",
          isFlowHead && "z-[1] scale-[1.01] shadow-sm ring-1 ring-primary/35",
        )}
      >
        <span className="sr-only">{statusLabel(a.status)}</span>
        <div className="flex w-8 shrink-0 flex-col items-center justify-center gap-cg-0.5 pt-0.5">
          <span className="font-mono text-ds-label text-muted-foreground">#{queuePosition}</span>
        </div>
        <div className="flex w-[3.35rem] shrink-0 flex-col items-center justify-center pt-0.5">
          <Badge variant={prioVariant} className="max-w-full px-cg-1 py-0 text-[10px] font-normal leading-tight">
            <span className="me-0.5" aria-hidden>
              {prioGlyph}
            </span>
            {prioLabel}
          </Badge>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-cg-2">
            <p
              className={cn(
                "truncate font-semibold",
                showExecutionRailHint && decisionGateActive ? "text-primary" : "text-foreground",
              )}
            >
              {showExecutionRailHint && decisionGateActive ? "> " : null}
              {a.patient_display_name ?? "مريض"}
            </p>
            <span className="shrink-0 font-mono text-ds-small text-muted-foreground">{timeLabel(st)}</span>
          </div>
          <p className="mt-cg-0.5 line-clamp-2 text-ds-label text-foreground/90">{subtitle}</p>
          {showExecutionRailHint ? (
            <p
              className={cn(
                "mt-cg-0.5 text-ds-label font-medium",
                decisionGateActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              {decisionGateActive ? "← سيتم الاستدعاء من صف «الآن» أعلاه" : "← موصى به كالتالي للاستدعاء"}
            </p>
          ) : null}
        </div>
        <QueueRowActionBar
          row={row}
          ops={ops}
          clinicTimezone={clinicTimezone}
          workspaceMode={workspaceMode}
          isDoctorMode={isDoctorMode}
        />
      </div>
    );
  }

  const worklistCount = queueSections.reduce((n, s) => n + s.rows.length, 0);
  const showWorklist = worklistCount > 0 || hasOperationalLead;

  return (
    <WorkspacePanel
      title="الطابور الحي"
      subtitle={isList ? "تدفّق واحد بالأولوية (بدون أقسام)" : "قائمة عمل موحّدة بالأولوية"}
      className="flex min-h-0 min-w-0 flex-col"
      contentClassName="flex min-h-0 flex-col gap-cg-3 overflow-auto p-cg-4"
    >
      {!showWorklist ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-cg-4 text-ds-body text-muted-foreground">
          <p className="font-medium text-foreground">لا يوجد في الطابور الآن</p>
          <p className="mt-cg-2 text-ds-small">
            {smartEmptyHint.nextName && smartEmptyHint.nextAt ? (
              <>
                المتوقع القادم:{" "}
                <span className="font-medium text-foreground">
                  {smartEmptyHint.nextName} · {smartEmptyHint.nextAt}
                </span>
              </>
            ) : (
              <>لا مواعيد نشطة في نافذة اليوم — راجع التخطيط إن لزم.</>
            )}
          </p>
          {smartEmptyHint.lastName && smartEmptyHint.lastAt?.isValid ? (
            <p className="mt-cg-1 text-ds-label">
              آخر إكمال مسجّل: {smartEmptyHint.lastName} ·{" "}
              {smartEmptyHint.lastAt.setLocale("ar").toFormat("HH:mm")}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="relative min-h-0 space-y-cg-3">
          {queueInteractionLocked ? (
            <div className="rounded-lg border border-destructive/35 bg-destructive/[0.06] px-cg-3 py-cg-2 text-ds-label leading-snug text-destructive">
              الوضع الصارم: نفّذ أو تجاهل من صف «الآن» أعلى الطابور — الصفوف التالية للسياق فقط (بدون أزرار تنفيذ هنا).
            </div>
          ) : null}
          <div className="min-h-0">
            {isList ? (
              <div className="space-y-cg-1">
                <p className="text-ds-label text-muted-foreground/90">
                  يتم العمل من أعلى القائمة إلى الأسفل <span aria-hidden>↓</span>
                </p>
                <div className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/45 bg-card/25">
                  {hasOperationalLead ? <QueueDecisionLeadRow ops={ops} /> : null}
                  {listStreamRows.map(({ row, tone }, idx) =>
                    renderListRow(row, tone, idx + 1 + (hasOperationalLead ? 1 : 0)),
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-cg-4">
                {queueSections.map((sec) => (
                  <div key={sec.key}>
                    <p className="mb-cg-2 text-ds-label font-medium text-muted-foreground">{sec.bandLabel}</p>
                    <div className="space-y-cg-2">
                      {sec.rows.map((row) => renderCard(row, sec.tone))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <p
        className={cn(
          "text-ds-label",
          nextConflict ? "font-medium text-warning" : "text-muted-foreground",
        )}
      >
        التالي للتشغيل:{" "}
        <span className="font-medium text-foreground">{todayTimeline.serveNext?.patient_display_name ?? "—"}</span>
        {nextConflict ? (
          <span className="ms-1 text-warning">· تعارض مع التقويم: {todayTimeline.calendarNext?.patient_display_name ?? ""}</span>
        ) : null}
      </p>
      <Button variant="outline" size="sm" className="w-full shrink-0" asChild>
        <Link href="/appointments">فتح التخطيط والتقويم</Link>
      </Button>
    </WorkspacePanel>
  );
}
