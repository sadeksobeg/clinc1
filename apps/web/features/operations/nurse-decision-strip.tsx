"use client";

import { useMemo } from "react";
import { AlertTriangle, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ClinicDayOperationsResult } from "@/features/appointments/use-clinic-day-operations";
import { toClinicZoned } from "@/lib/format";
import {
  FORECAST_CONFIDENCE_WARNING_THRESHOLD,
  type AppointmentProjection,
  type BrainSuggestion,
  type OperationalMode,
} from "@/lib/clinic-brain/v2";
import type { AppointmentRow } from "@/lib/ops-server";

type OpsPick = Pick<
  ClinicDayOperationsResult,
  | "suggestions"
  | "primaryOperationalSuggestion"
  | "secondaryOperationalSuggestions"
  | "slaSuggestions"
  | "todayOps"
  | "todayTimeline"
  | "executeSuggestion"
  | "dismissPrimaryDecision"
  | "resetPrimaryDecision"
  | "decisionDismissed"
  | "operationalMode"
  | "setOperationalMode"
  | "decisionGateActive"
  | "appointments"
  | "enrichedProjectionById"
  | "etaMinutesFor"
  | "operationalPrimaryChangeHint"
>;

type Props = {
  ops: OpsPick;
  clinicTimezone: string;
  /** إخفاء بطاقة القرار الكبيرة عند وجود توصية — يُعرض صف «الآن» داخل الطابور */
  queueCentric?: boolean;
};

const ACTION_LABEL: Record<BrainSuggestion["action"], string> = {
  call_next: "استدعاء التالي",
  delay_message: "تنبيه تأخير",
  reschedule: "إعادة جدولة / تصعيد",
  review_conflict: "مراجعة تعارض",
  escalate_load: "ضغط الطابور",
  mark_no_show: "تسجيل عدم الحضور",
};

const MODE_LABEL: Record<OperationalMode, string> = {
  suggestive: "اقتراحي",
  guided: "موجّه",
  strict: "صارم",
};

function primaryCtaLabel(s: BrainSuggestion, patientName: string | null | undefined): string {
  if (s.action === "call_next" && patientName) return `استدعاء: ${patientName}`;
  return ACTION_LABEL[s.action] ?? s.action;
}

/** تقدير بصري لعدد المواعيد اللاحقة المتأثرة بالجدول بعد موعد القرار. */
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
  if (s.action === "review_conflict") return "مراجعة تعارض";
  if (s.action === "escalate_load") return "ضغط الطابور";
  return ACTION_LABEL[s.action] ?? s.action;
}

function preActionEffectLines(s: BrainSuggestion, patientName: string | null | undefined): string[] {
  const name = patientName ?? "المريض";
  switch (s.action) {
    case "call_next":
      return [
        `تسجيل حضور ${name} في الطابور`,
        "تحديث حالة الوصول إلى «داخل العيادة»",
        "لا يغيّر هذا الزر وقت الموعد في التقويم تلقائيًا",
      ];
    case "delay_message":
      return ["إرسال رسالة تأخير للمريض عبر قناة العيادة", "تسجيل الإرسال للمراجعة التشغيلية"];
    case "mark_no_show":
      return ["تسجيل عدم حضور الموعد", "إرسال رسالة متابعة إن وُجدت إعدادات لذلك"];
    case "reschedule":
      return ["التمرير إلى بطاقة الموعد في الطابور", "لا يغيّر الجدول تلقائيًا من هنا"];
    case "review_conflict":
      return ["التمرير إلى الموعد ذي التعارض", "مراجعة يدوية قبل أي تعديل"];
    case "escalate_load":
      return ["تنبيه تشغيلي فقط — لا تغيير حالة موعد"];
    default:
      return ["تنفيذ الإجراء المقترح", "تحديث ما يدعمه النظام من حالات"];
  }
}

function whyThisSuggestionLines(
  s: BrainSuggestion,
  args: {
    todayOps: OpsPick["todayOps"];
    todayTimeline: OpsPick["todayTimeline"];
    enriched: AppointmentProjection | undefined;
  },
): string[] {
  const { todayOps, todayTimeline, enriched } = args;
  const out: string[] = [];
  if (s.action !== "call_next" || s.appointment_id == null) {
    out.push("مطابق لقواعد الأولوية الحالية في الـ Brain");
    return out;
  }
  const id = s.appointment_id;
  if (todayOps.emergencies[0]?.a.id === id) out.push("في مقدّمة طابور الطوارئ");
  if (todayOps.lateItems[0]?.a.id === id) out.push("أول متأخّر في قائمة اليوم");
  if (todayTimeline.serveNext?.id === id) out.push("يتوافق مع «التالي للتشغيل»");
  if (enriched?.bucket === "READY") out.push("الحالة: جاهز للاستدعاء");
  else if (enriched?.bucket === "NOW") out.push("الحالة: ضمن نافذة الكشف الحالية");
  if (enriched?.risk_level === "high") out.push("مخاطر تشغيل مرتفعة — يستحق المعالجة أولًا");
  if (out.length === 0) out.push("الأنسب حسب ترتيب الطابور والجدول الآن");
  return out.slice(0, 5);
}

export function NurseDecisionStrip({ ops, clinicTimezone, queueCentric = false }: Props) {
  const {
    suggestions,
    primaryOperationalSuggestion,
    secondaryOperationalSuggestions,
    slaSuggestions,
    todayOps,
    todayTimeline,
    executeSuggestion,
    dismissPrimaryDecision,
    resetPrimaryDecision,
    decisionDismissed,
    operationalMode,
    setOperationalMode,
    decisionGateActive,
    appointments,
    enrichedProjectionById,
    etaMinutesFor,
    operationalPrimaryChangeHint,
  } = ops;

  const delaySla = slaSuggestions.filter((x) => x.kind === "send_delay_message").length;
  const lateN = todayOps.lateItems.length;
  const isQueueFallback = suggestions.length === 0 && primaryOperationalSuggestion != null;

  const modeSelect = (
    <Select value={operationalMode} onValueChange={(v) => setOperationalMode(v as OperationalMode)}>
      <SelectTrigger className="h-8 w-[7.5rem] shrink-0 text-ds-label" aria-label="وضع التشغيل">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="suggestive">{MODE_LABEL.suggestive}</SelectItem>
        <SelectItem value="guided">{MODE_LABEL.guided}</SelectItem>
        <SelectItem value="strict">{MODE_LABEL.strict}</SelectItem>
      </SelectContent>
    </Select>
  );

  if (!primaryOperationalSuggestion && !decisionDismissed) {
    const next = todayTimeline.next;
    const nextLocal = next ? toClinicZoned(next.starts_at, clinicTimezone) : null;
    return (
      <div className="flex min-h-[10rem] shrink-0 flex-col justify-center rounded-2xl border border-border/60 bg-muted/20 px-cg-4 py-cg-4 text-ds-small text-muted-foreground">
        <div className="flex flex-wrap items-start justify-between gap-cg-3">
          <div className="min-w-0 flex-1 space-y-cg-2">
            <div>
              <span className="font-medium text-foreground">الحالة الحالية</span>
              <p className="mt-cg-1 text-ds-body">
                الطابور مستقر — لا موعد في مقدّمة التشغيل يتطلب تحريكًا الآن
                {lateN > 0 ? ` (متأخرون: ${lateN})` : ""}.
              </p>
            </div>
            {next && nextLocal?.isValid ? (
              <p className="text-ds-label">
                أقرب موعد على التقويم:{" "}
                <span className="font-medium text-foreground">
                  {next.patient_display_name ?? "مريض"} · {nextLocal.setLocale("ar").toFormat("HH:mm")}
                </span>
              </p>
            ) : (
              <p className="text-ds-label">لا مواعيد قادمة في نافذة اليوم المعروضة.</p>
            )}
          </div>
          <div className="shrink-0">{modeSelect}</div>
        </div>
      </div>
    );
  }

  if (decisionDismissed) {
    return (
      <div
        className={[
          "flex min-h-[10rem] shrink-0 flex-col justify-center rounded-2xl border bg-muted/25 px-cg-4 py-cg-4",
          decisionGateActive ? "border-destructive/50 ring-1 ring-destructive/25" : "border-border/60",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center justify-between gap-cg-3">
          <p className="text-ds-small text-muted-foreground">
            تم تجاهل التوصية الحالية. ستُحدَّث تلقائيًا عند تغيّر الطابور.
          </p>
          <div className="flex items-center gap-cg-2">
            <Button type="button" variant="secondary" size="sm" onClick={resetPrimaryDecision}>
              إظهار التوصية
            </Button>
            {modeSelect}
          </div>
        </div>
      </div>
    );
  }

  const top = primaryOperationalSuggestion;
  if (!top) return null;

  if (queueCentric) return null;

  const restCount = secondaryOperationalSuggestions.length;
  const patientName =
    top.appointment_id != null ? appointments.find((a) => a.id === top.appointment_id)?.patient_display_name : null;
  const lowForecast =
    top.forecast_confidence != null && top.forecast_confidence < FORECAST_CONFIDENCE_WARNING_THRESHOLD;
  const enriched = top.appointment_id != null ? enrichedProjectionById.get(top.appointment_id) : undefined;
  const eta = top.appointment_id != null ? etaMinutesFor(top.appointment_id) : null;
  const etaLine =
    eta != null && Number.isFinite(eta)
      ? eta <= 0
        ? "البدء: الآن أو متأخر"
        : `المتوقع خلال ~${Math.round(eta)} د`
      : top.action === "call_next"
        ? "البدء: حسب الجدول"
        : null;

  const downstream =
    top.appointment_id != null ? downstreamAppointmentCount(appointments, top.appointment_id) : 0;
  const delayM = enriched?.delay_minutes ?? top.signals?.delay_minutes ?? 0;
  const impactParts: string[] = [];
  if (delayM > 0) impactParts.push(`تأخر متوقع ~${Math.round(delayM)} د على الجدول`);
  if (downstream > 0) impactParts.push(`قد يتأثر حتى ${downstream} موعدًا لاحقًا`);
  if (enriched?.risk_level === "high") impactParts.push("مخاطر تشغيل عالية");
  else if (enriched?.risk_level === "medium") impactParts.push("مراقبة مخاطر متوسطة");
  const impactLine = impactParts.length ? impactParts.join(" · ") : null;

  const alternateActions = secondaryOperationalSuggestions.filter((s) => s.action !== top.action).slice(0, 2);

  const preLines = useMemo(() => preActionEffectLines(top, patientName), [top, patientName]);
  const whyLines = useMemo(
    () => whyThisSuggestionLines(top, { todayOps, todayTimeline, enriched }),
    [top, todayOps, todayTimeline, enriched],
  );

  return (
    <div
      className={[
        "w-full shrink-0 rounded-2xl border border-primary/45 bg-gradient-to-b from-primary/[0.14] to-primary/[0.06] px-cg-5 py-cg-5 shadow-md",
        decisionGateActive ? "ring-2 ring-destructive/35 ring-offset-2 ring-offset-background" : "ring-1 ring-primary/25",
      ].join(" ")}
    >
      {operationalPrimaryChangeHint ? (
        <p className="mb-cg-3 rounded-lg border border-border/60 bg-background/90 px-cg-3 py-cg-2 text-ds-small leading-snug text-foreground transition-opacity duration-300">
          {operationalPrimaryChangeHint}
        </p>
      ) : null}
      <div className="mb-cg-3 flex flex-wrap items-center justify-between gap-cg-2 text-ds-label text-muted-foreground">
        <div className="flex min-w-0 flex-wrap items-center gap-x-cg-3 gap-y-1">
          {decisionGateActive ? (
            <Badge variant="danger" className="text-ds-label font-semibold">
              وضع صارم — تنفيذ مطلوب الآن
            </Badge>
          ) : top.confidence >= 82 ? (
            <Badge variant="secondary" className="text-ds-label">
              الحالة: جاهز للتنفيذ
            </Badge>
          ) : null}
          {enriched?.risk_level === "high" && downstream > 0 ? (
            <Badge variant="danger" className="text-ds-label font-semibold">
              قد يتأثر {downstream} موعدًا لاحقًا
            </Badge>
          ) : null}
          {lateN > 0 ? (
            <span>
              <span className="font-medium text-foreground">{lateN}</span> موعد متأخر
            </span>
          ) : (
            <span>لا مواعيد متأخرة في التبويب</span>
          )}
          {delaySla > 0 ? (
            <span className="text-warning">
              مطلوب تنبيه تأخير (×{delaySla})
            </span>
          ) : null}
        </div>
        {decisionGateActive ? (
          <span className="rounded-md border border-border/60 bg-muted/30 px-cg-2 py-cg-1 text-ds-label font-medium text-foreground">
            {MODE_LABEL.strict}
          </span>
        ) : (
          modeSelect
        )}
      </div>

      <div className="flex flex-col gap-cg-4 sm:flex-row sm:items-start sm:gap-cg-5">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary" aria-hidden>
          <Flame className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-cg-2">
          <div className="flex flex-wrap items-center gap-cg-2">
            <p className="text-ds-label font-semibold text-foreground">
              {decisionGateActive ? "لوحة التحكم التشغيلية" : "مركز الحالة"}
            </p>
            {isQueueFallback ? (
              <Badge variant="outline" className="text-ds-label">
                من الطابور
              </Badge>
            ) : null}
            <Badge variant="secondary" className="text-ds-label">
              {ACTION_LABEL[top.action] ?? top.action}
            </Badge>
            <span className="text-ds-label text-muted-foreground">ثقة ~{top.confidence}%</span>
            {top.autoExecutable ? (
              <Badge variant="outline" className="text-ds-label text-success">
                جاهز للتنفيذ
              </Badge>
            ) : null}
          </div>
          <p className="text-ds-body text-lg font-medium leading-relaxed text-foreground sm:text-xl">{top.reason}</p>
          {patientName && top.action === "call_next" ? (
            <p className="text-ds-body font-semibold text-foreground">
              {decisionGateActive ? "استدعِ الآن:" : "استدعِ:"}{" "}
              <span className="text-primary">{patientName}</span>
              {eta != null && Number.isFinite(eta) && eta > 0 ? (
                <span className="ms-1 text-ds-label font-normal text-muted-foreground">(متوقع خلال ~{Math.round(eta)} د)</span>
              ) : null}
            </p>
          ) : null}
          {impactLine ? (
            <p className="rounded-lg border border-border/50 bg-background/60 px-cg-3 py-cg-2 text-ds-small leading-snug text-foreground">
              {impactLine}
            </p>
          ) : null}
          {etaLine ? <p className="text-ds-label text-primary/90">{etaLine}</p> : null}
          {enriched?.expected_start?.isValid && top.appointment_id != null ? (
            <p className="text-ds-label text-muted-foreground">
              إسقاط البدء: {enriched.expected_start.setLocale("ar").toFormat("HH:mm")}
              {enriched.expected_end?.isValid
                ? ` — النهاية المتوقعة ${enriched.expected_end.setLocale("ar").toFormat("HH:mm")}`
                : ""}
            </p>
          ) : null}
          {lowForecast ? (
            <p className="flex items-start gap-cg-2 text-ds-small text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                توقّع الجدول غير مؤكد (أقل من {FORECAST_CONFIDENCE_WARNING_THRESHOLD}٪) — راجع يدويًا قبل الاعتماد
                التلقائي.
              </span>
            </p>
          ) : null}
          {top.appointment_id != null ? (
            <p className="font-mono text-ds-label text-muted-foreground">موعد #{top.appointment_id}</p>
          ) : null}
        </div>
      </div>

      {preLines.length > 0 || whyLines.length > 0 ? (
        <div className="mt-cg-3 grid gap-cg-3 border-t border-border/45 pt-cg-3 sm:grid-cols-2">
          {preLines.length > 0 ? (
            <div className="space-y-cg-1 rounded-lg bg-muted/25 px-cg-3 py-cg-2 text-ds-small text-foreground">
              <p className="text-ds-label font-semibold text-muted-foreground">سيتم بعد التنفيذ</p>
              <ul className="list-disc space-y-cg-0.5 ps-cg-4">
                {preLines.map((line, i) => (
                  <li key={`pre-${i}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {whyLines.length > 0 ? (
            <div className="space-y-cg-1 rounded-lg border border-border/50 bg-background/70 px-cg-3 py-cg-2 text-ds-small text-foreground">
              <p className="text-ds-label font-semibold text-muted-foreground">لماذا هذا الإجراء؟</p>
              <ul className="list-disc space-y-cg-0.5 ps-cg-4">
                {whyLines.map((line, i) => (
                  <li key={`why-${i}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-cg-4 flex flex-col gap-cg-2 border-t border-border/50 pt-cg-4 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="button" size="lg" className="min-h-12 min-w-[12rem] font-semibold" onClick={() => void executeSuggestion(top)}>
          {decisionGateActive && top.action === "call_next"
            ? "استدعاء الآن"
            : primaryCtaLabel(top, patientName ?? null)}
        </Button>
        {!decisionGateActive
          ? alternateActions.map((s, i) => (
              <Button
                key={`${s.action}-${s.appointment_id ?? i}`}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10"
                onClick={() => void executeSuggestion(s)}
              >
                {secondaryActionShortLabel(s)}
              </Button>
            ))
          : null}
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={dismissPrimaryDecision}>
          تجاهل
        </Button>
        {restCount > 0 ? (
          <span className="text-ds-small text-muted-foreground">+{restCount} إجراءات في الخلفية</span>
        ) : null}
      </div>
    </div>
  );
}
