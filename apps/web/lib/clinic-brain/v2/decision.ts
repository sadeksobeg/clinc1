import type { AppointmentRow } from "@/lib/ops-server";
import type { OperationalTransition } from "@/lib/clinic-operational-transitions";
import type { LoadLevel } from "@/lib/clinic-brain/selection";
import type { AppointmentProjection } from "./projection";
import type { SlaSuggestion } from "./sla";

export type OperationalMode = "suggestive" | "guided" | "strict";

export type BrainSuggestionAction =
  | "call_next"
  | "delay_message"
  | "reschedule"
  | "review_conflict"
  | "escalate_load"
  | "mark_no_show";

export type BrainSuggestion = {
  action: BrainSuggestionAction;
  /** انتقال آلة تشغيل مقترَح (يُملأ تلقائيًا من `action` — للتوافق مع UI الانتقالات). */
  operationalTransition?: OperationalTransition | null;
  reason: string;
  /** Decision confidence (queue / SLA), 0–100. */
  confidence: number;
  appointment_id?: number;
  related_sla_kind?: string;
  /** Forecast quality for this appointment from projection layer (if known). */
  forecast_confidence?: number | null;
  /** True → primary button runs without extra prompts (when policy allows). */
  autoExecutable: boolean;
  /** True → show confirm before side effects (delay / no-show / reschedule). */
  requiresConfirmation: boolean;
  /** SLA / projection numeric hints for ordering & UI (optional). */
  signals?: { delay_minutes?: number; minutes_since_scheduled_start?: number };
};

const FORECAST_UNCERTAIN_THRESHOLD = 40;
const AUTO_EXEC_CONFIDENCE = 78;

function operationalTransitionForAction(action: BrainSuggestionAction): OperationalTransition | null {
  switch (action) {
    case "call_next":
      return "CALL";
    case "delay_message":
      return "DELAY";
    case "mark_no_show":
      return "NO_SHOW";
    default:
      return null;
  }
}

function attachExecutionFields(
  partial: Omit<BrainSuggestion, "autoExecutable" | "requiresConfirmation"> & {
    forecast_confidence?: number | null;
  },
): BrainSuggestion {
  const fc = partial.forecast_confidence;
  const uncertain = fc != null && fc < FORECAST_UNCERTAIN_THRESHOLD;

  let autoExecutable = false;
  let requiresConfirmation = false;

  switch (partial.action) {
    case "call_next":
      autoExecutable = partial.confidence >= AUTO_EXEC_CONFIDENCE && !uncertain;
      requiresConfirmation = !autoExecutable;
      break;
    case "delay_message":
      autoExecutable = partial.confidence >= 72 && !uncertain;
      requiresConfirmation = true;
      break;
    case "mark_no_show":
    case "reschedule":
      autoExecutable = false;
      requiresConfirmation = true;
      break;
    case "review_conflict":
      autoExecutable = true;
      requiresConfirmation = false;
      break;
    case "escalate_load":
      autoExecutable = false;
      requiresConfirmation = false;
      break;
    default:
      requiresConfirmation = true;
  }

  return {
    ...partial,
    operationalTransition: operationalTransitionForAction(partial.action) ?? undefined,
    autoExecutable,
    requiresConfirmation,
  };
}

/** Above this delay (minutes), bump delay_message right after call_next for visibility (“auto-trigger” UX). */
const HEAVY_DELAY_PROMOTE_MIN = 20;

function prioritizeHeavyDelaySuggestions(out: BrainSuggestion[]): BrainSuggestion[] {
  const idx = out.findIndex(
    (x) =>
      x.action === "delay_message" && (x.signals?.delay_minutes ?? 0) > HEAVY_DELAY_PROMOTE_MIN,
  );
  if (idx <= 0) return out;
  const next = [...out];
  const [item] = next.splice(idx, 1);
  const callIdx = next.findIndex((x) => x.action === "call_next");
  const insertAt = callIdx >= 0 ? callIdx + 1 : 0;
  next.splice(insertAt, 0, item);
  return next;
}

/**
 * Aggregates queue truth + SLA signals into executable suggestions.
 */
export function buildBrainSuggestions(args: {
  serveNext: AppointmentRow | null;
  calendarNext: AppointmentRow | null;
  isServeCalendarConflict: boolean;
  sla: SlaSuggestion[];
  loadLevel: LoadLevel;
  enrichedByAppointmentId?: Map<number, AppointmentProjection> | null;
}): BrainSuggestion[] {
  const out: BrainSuggestion[] = [];
  const {
    serveNext,
    calendarNext,
    isServeCalendarConflict,
    sla,
    loadLevel,
    enrichedByAppointmentId,
  } = args;

  const fc = (id: number | undefined) =>
    id != null ? enrichedByAppointmentId?.get(id)?.confidence ?? null : null;

  if (serveNext) {
    out.push(
      attachExecutionFields({
        action: "call_next",
        reason: `التالي تشغيليًا: ${serveNext.patient_display_name ?? "مريض"} — استدعِ هذا الموعد أولًا.`,
        confidence: isServeCalendarConflict ? 72 : 88,
        appointment_id: serveNext.id,
        forecast_confidence: fc(serveNext.id),
      }),
    );
  }

  if (isServeCalendarConflict && calendarNext && serveNext && calendarNext.id !== serveNext.id) {
    out.push(
      attachExecutionFields({
        action: "review_conflict",
        reason: `التقويم يظهر أقرب موعدًا آخر (${calendarNext.patient_display_name ?? ""}) — راجع إن كان يجب الإبقاء على الأولوية التشغيلية.`,
        confidence: 76,
        appointment_id: calendarNext.id,
        forecast_confidence: fc(calendarNext.id),
      }),
    );
  }

  for (const s of sla) {
    if (s.kind === "send_delay_message") {
      out.push(
        attachExecutionFields({
          action: "delay_message",
          reason: s.reason,
          confidence: 70,
          appointment_id: s.appointment_id,
          related_sla_kind: s.kind,
          forecast_confidence: fc(s.appointment_id),
          signals: { delay_minutes: s.metrics.delay_minutes },
        }),
      );
    } else if (s.kind === "reschedule_or_escalate") {
      out.push(
        attachExecutionFields({
          action: "reschedule",
          reason: s.reason,
          confidence: 68,
          appointment_id: s.appointment_id,
          related_sla_kind: s.kind,
          forecast_confidence: fc(s.appointment_id),
        }),
      );
    } else if (s.kind === "mark_no_show_candidate") {
      out.push(
        attachExecutionFields({
          action: "mark_no_show",
          reason: s.reason,
          confidence: 62,
          appointment_id: s.appointment_id,
          related_sla_kind: s.kind,
          forecast_confidence: fc(s.appointment_id),
          signals: { minutes_since_scheduled_start: s.metrics.minutes_since_scheduled_start },
        }),
      );
    }
  }

  if (loadLevel === "critical" || loadLevel === "high") {
    out.push(
      attachExecutionFields({
        action: "escalate_load",
        reason:
          loadLevel === "critical"
            ? "ضغط حرج على الطابور — راجع توزيع الأطباء أو إعادة جدولة جزئية."
            : "ضغط عالٍ على الطابور — راقب التأخير والحضور.",
        confidence: loadLevel === "critical" ? 85 : 65,
      }),
    );
  }

  return prioritizeHeavyDelaySuggestions(out);
}

/**
 * When `buildBrainSuggestions` is empty but the queue still has an actionable row
 * (e.g. edge engine state), the UI can surface the same execution path as engine `call_next`.
 */
export function brainCallNextSuggestion(args: {
  appointmentId: number;
  patientDisplayName?: string | null;
  reason?: string;
  confidence?: number;
  forecast_confidence?: number | null;
  isServeCalendarConflict?: boolean;
}): BrainSuggestion {
  const name = args.patientDisplayName ?? "مريض";
  return attachExecutionFields({
    action: "call_next",
    reason: args.reason ?? `التالي المقترح: ${name} — استدعِ هذا الموعد.`,
    confidence: args.confidence ?? (args.isServeCalendarConflict ? 72 : 82),
    appointment_id: args.appointmentId,
    forecast_confidence: args.forecast_confidence ?? null,
  });
}

export const FORECAST_CONFIDENCE_WARNING_THRESHOLD = FORECAST_UNCERTAIN_THRESHOLD;
