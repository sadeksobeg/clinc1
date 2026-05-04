"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ClinicDayOperationsResult } from "@/features/appointments/use-clinic-day-operations";
import {
  FORECAST_CONFIDENCE_WARNING_THRESHOLD,
  type BrainSuggestion,
  type OperationalMode,
} from "@/lib/clinic-brain/v2";
import type { AppointmentRow } from "@/lib/ops-server";
import { operationalSessionPhaseLabelAr } from "@/lib/clinic-operational-session";
import {
  getAllowedTransitionsForLeadRow,
  type OperationalTransition,
} from "@/lib/clinic-operational-transitions";
import { isEmergencyAppointmentRow } from "@/lib/operational-appointment";

type OpsPick = Pick<
  ClinicDayOperationsResult,
  | "primaryOperationalSuggestion"
  | "activeOperationalSession"
  | "secondaryOperationalSuggestions"
  | "slaSuggestions"
  | "todayOps"
  | "todayTimeline"
  | "executeSuggestion"
  | "transitionOperational"
  | "dismissPrimaryDecision"
  | "operationalMode"
  | "setOperationalMode"
  | "decisionGateActive"
  | "appointments"
  | "enrichedProjectionById"
  | "etaMinutesFor"
  | "operationalPrimaryChangeHint"
  | "operationalSessionTimeoutHint"
>;

const ACTION_LABEL: Record<BrainSuggestion["action"], string> = {
  call_next: "استدعاء",
  delay_message: "تنبيه تأخير",
  reschedule: "إعادة جدولة",
  review_conflict: "تعارض",
  escalate_load: "ضغط",
  mark_no_show: "عدم حضور",
};

const MODE_LABEL: Record<OperationalMode, string> = {
  suggestive: "اقتراحي",
  guided: "موجّه",
  strict: "صارم",
};

const TRANSITION_CTA_AR: Record<OperationalTransition, string> = {
  CALL: "استدعاء",
  START: "بدء الكشف",
  COMPLETE: "إنهاء الكشف",
  DELAY: "تنبيه تأخير",
  NO_SHOW: "لم يحضر",
  CANCEL: "إلغاء الحجز",
};

const TRANSITION_PRIMARY_ORDER: OperationalTransition[] = ["CALL", "START", "COMPLETE", "DELAY", "NO_SHOW", "CANCEL"];

function downstreamAppointmentCount(appointments: AppointmentRow[], primaryAppointmentId: number): number {
  const row = appointments.find((a) => a.id === primaryAppointmentId);
  if (!row) return 0;
  const t = new Date(row.starts_at).getTime();
  const dead = new Set(["completed", "cancelled", "no_show"]);
  return appointments.filter((a) => {
    if (a.id === primaryAppointmentId) return false;
    if (dead.has(String(a.status || "").toLowerCase())) return false;
    return new Date(a.starts_at).getTime() >= t;
  }).length;
}

function secondaryActionShortLabel(s: BrainSuggestion): string {
  if (s.action === "delay_message") return "تنبيه تأخير";
  if (s.action === "mark_no_show") return "لم يحضر";
  if (s.action === "reschedule") return "إعادة جدولة";
  if (s.action === "review_conflict") return "تعارض";
  if (s.action === "escalate_load") return "ضغط";
  return ACTION_LABEL[s.action] ?? s.action;
}

type Props = {
  ops: OpsPick;
};

/**
 * صف «NOW» داخل الطابور — يعرض الحالة والانتقالات المسموحة (session + guards)، مع Brain اختياري للسياق فقط.
 */
export function QueueDecisionLeadRow({ ops }: Props) {
  const {
    primaryOperationalSuggestion: top,
    activeOperationalSession,
    secondaryOperationalSuggestions,
    slaSuggestions,
    todayOps,
    executeSuggestion,
    transitionOperational,
    dismissPrimaryDecision,
    operationalMode,
    setOperationalMode,
    decisionGateActive,
    appointments,
    enrichedProjectionById,
    etaMinutesFor,
    operationalPrimaryChangeHint,
    operationalSessionTimeoutHint,
  } = ops;

  if (!top && !activeOperationalSession) return null;

  const leadId = activeOperationalSession?.appointmentId ?? top?.appointment_id ?? null;
  const rowForLead = leadId != null ? appointments.find((a) => a.id === leadId) : undefined;
  const isEmergencyLead = isEmergencyAppointmentRow(rowForLead);

  const delaySla = slaSuggestions.filter((x) => x.kind === "send_delay_message").length;
  const lateN = todayOps.lateItems.length;
  const patientName = rowForLead?.patient_display_name ?? null;
  const enriched = leadId != null ? enrichedProjectionById.get(leadId) : undefined;
  const eta = leadId != null ? etaMinutesFor(leadId) : null;
  const downstream = leadId != null ? downstreamAppointmentCount(appointments, leadId) : 0;
  const delayM = enriched?.delay_minutes ?? top?.signals?.delay_minutes ?? 0;
  const lowForecast =
    top?.forecast_confidence != null && top.forecast_confidence < FORECAST_CONFIDENCE_WARNING_THRESHOLD;

  const sublineParts: string[] = [];
  if (delayM > 0) sublineParts.push(`تأخر ~${Math.round(delayM)} د`);
  if (downstream > 0) sublineParts.push(`قد يتأثر ${downstream} موعدًا لاحقًا`);
  if (enriched?.risk_level === "high") sublineParts.push("مخاطر عالية");
  const subline = sublineParts.length ? sublineParts.join(" — ") : null;

  const alternateActions = top
    ? secondaryOperationalSuggestions.filter((s) => s.action !== top.action).slice(0, 2)
    : [];

  const modeSelect = (
    <Select value={operationalMode} onValueChange={(v) => setOperationalMode(v as OperationalMode)}>
      <SelectTrigger className="h-8 w-[6.5rem] shrink-0 text-ds-label" aria-label="وضع التشغيل">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="suggestive">{MODE_LABEL.suggestive}</SelectItem>
        <SelectItem value="guided">{MODE_LABEL.guided}</SelectItem>
        <SelectItem value="strict">{MODE_LABEL.strict}</SelectItem>
      </SelectContent>
    </Select>
  );

  const sessionMatchesLead =
    leadId != null && activeOperationalSession != null && activeOperationalSession.appointmentId === leadId;
  const sessionMinsLocked =
    sessionMatchesLead && activeOperationalSession
      ? Math.max(0, Math.round((Date.now() - activeOperationalSession.startedAt) / 60_000))
      : null;

  const allowedTransitions = useMemo(
    () => getAllowedTransitionsForLeadRow(activeOperationalSession, leadId, isEmergencyLead),
    [activeOperationalSession, leadId, isEmergencyLead],
  );

  const primaryTransition =
    TRANSITION_PRIMARY_ORDER.find((t) => allowedTransitions.includes(t)) ?? null;

  const brainPolicy = top
    ? { requiresConfirmation: top.requiresConfirmation, autoExecutable: top.autoExecutable }
    : { requiresConfirmation: true, autoExecutable: false };

  const extraTransitions = useMemo(() => {
    let list =
      primaryTransition == null ? allowedTransitions : allowedTransitions.filter((t) => t !== primaryTransition);
    if (!activeOperationalSession) {
      list = list.filter((t) => t !== "NO_SHOW" && t !== "CANCEL");
    }
    return list;
  }, [allowedTransitions, primaryTransition, activeOperationalSession]);

  const titleLine =
    sessionMatchesLead && activeOperationalSession
      ? `الحالة: ${operationalSessionPhaseLabelAr(activeOperationalSession.state)}${patientName ? ` — ${patientName}` : ""}`
      : top?.action === "call_next" && patientName
        ? decisionGateActive
          ? `استدعِ الآن: ${patientName}`
          : `التالي للتنفيذ: ${patientName}`
        : (top?.reason ?? "التشغيل");

  const primaryCta =
    primaryTransition != null
      ? TRANSITION_CTA_AR[primaryTransition]
      : top
        ? decisionGateActive && top.action === "call_next"
          ? "تنفيذ"
          : top.action === "call_next" && patientName
            ? `استدعاء ${patientName}`
            : ACTION_LABEL[top.action] ?? top.action
        : "—";

  const runPrimary = () => {
    if (primaryTransition != null) {
      return void transitionOperational(primaryTransition, leadId, { brainPolicy });
    }
    if (top) return void executeSuggestion(top);
  };

  return (
    <div
      className={[
        "border-b-2 border-primary/50 bg-gradient-to-b from-primary/[0.18] to-primary/[0.06] px-cg-3 py-cg-3 shadow-sm",
        decisionGateActive ? "ring-2 ring-destructive/30 ring-inset" : "",
      ].join(" ")}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="region"
      aria-label="إجراء التشغيل الحالي"
    >
      {operationalPrimaryChangeHint ? (
        <p className="mb-cg-2 rounded-md border border-border/50 bg-background/85 px-cg-2 py-cg-1.5 text-ds-label leading-snug text-foreground">
          {operationalPrimaryChangeHint}
        </p>
      ) : null}
      {operationalSessionTimeoutHint ? (
        <p className="mb-cg-2 rounded-md border border-warning/40 bg-warning/10 px-cg-2 py-cg-1.5 text-ds-label text-warning">
          {`مهلة الجلسة: يُقترح «لم يحضر» للموعد #${operationalSessionTimeoutHint.appointmentId} — «تم الاستدعاء» منذ أكثر من 10 د.`}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-cg-2 gap-y-1">
        <Badge variant="danger" className="text-ds-label font-semibold">
          الآن
        </Badge>
        {isEmergencyLead ? (
          <Badge variant="danger" className="text-ds-label">
            طوارئ
          </Badge>
        ) : null}
        {decisionGateActive ? (
          <Badge variant="outline" className="border-destructive/40 text-ds-label text-destructive">
            صارم
          </Badge>
        ) : null}
        {top ? (
          <>
            <Badge variant="secondary" className="text-ds-label">
              {ACTION_LABEL[top.action] ?? top.action}
            </Badge>
            <span className="text-ds-label text-muted-foreground">ثقة ~{top.confidence}%</span>
          </>
        ) : sessionMatchesLead && activeOperationalSession ? (
          <Badge variant="secondary" className="text-ds-label">
            {operationalSessionPhaseLabelAr(activeOperationalSession.state)}
          </Badge>
        ) : null}
        {lateN > 0 ? (
          <span className="text-ds-label text-muted-foreground">
            متأخرون: <span className="font-medium text-foreground">{lateN}</span>
          </span>
        ) : null}
        {delaySla > 0 ? (
          <span className="text-ds-label text-warning">تنبيه تأخير ×{delaySla}</span>
        ) : null}
        <div className="ms-auto shrink-0">
          {decisionGateActive ? (
            <span className="rounded border border-border/60 bg-muted/30 px-cg-2 py-cg-0.5 text-ds-label text-foreground">
              {MODE_LABEL.strict}
            </span>
          ) : (
            modeSelect
          )}
        </div>
      </div>

      <p className="mt-cg-2 text-ds-body font-semibold leading-snug text-foreground">{titleLine}</p>
      {sessionMatchesLead && activeOperationalSession && sessionMinsLocked != null ? (
        <p className="mt-cg-1 text-ds-label text-muted-foreground">
          الجلسة النشطة: {operationalSessionPhaseLabelAr(activeOperationalSession.state)}
          {sessionMinsLocked > 0 ? ` · منذ ~${sessionMinsLocked} د` : " · للتو"}
        </p>
      ) : null}
      {top?.action === "call_next" && patientName && eta != null && Number.isFinite(eta) && eta > 0 ? (
        <p className="mt-cg-0.5 text-ds-label text-muted-foreground">متوقع خلال ~{Math.round(eta)} د</p>
      ) : null}
      {subline ? (
        <p className="mt-cg-1 text-ds-small leading-snug text-muted-foreground">
          <span aria-hidden>↳ </span>
          {subline}
        </p>
      ) : null}
      {lowForecast ? (
        <p className="mt-cg-1 flex items-start gap-cg-1 text-ds-label text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>توقّع الجدول ضعيف الثقة</span>
        </p>
      ) : null}

      <div className="mt-cg-3 flex flex-wrap items-center gap-cg-2">
        <Button type="button" size="lg" className="min-h-11 min-w-[10rem] font-semibold" onClick={runPrimary}>
          {primaryCta}
        </Button>
        {!decisionGateActive
          ? alternateActions.map((s, i) => (
              <Button
                key={`${s.action}-${s.appointment_id ?? i}`}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9"
                onClick={() => void executeSuggestion(s)}
              >
                {secondaryActionShortLabel(s)}
              </Button>
            ))
          : null}
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={dismissPrimaryDecision}>
          تجاهل
        </Button>
      </div>
      {extraTransitions.length > 0 ? (
        <div className="mt-cg-2 flex flex-wrap gap-cg-1 border-t border-border/40 pt-cg-2">
          {extraTransitions.map((t) => (
            <Button
              key={t}
              type="button"
              variant="outline"
              size="sm"
              className="min-h-8 text-ds-label"
              onClick={() => void transitionOperational(t, leadId, { brainPolicy })}
            >
              {TRANSITION_CTA_AR[t]}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
