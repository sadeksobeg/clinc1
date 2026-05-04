import type { ActiveOperationalSession } from "@/lib/clinic-operational-session";

/** انتقالات آلة التشغيل الموحّدة (UI + Brain adapter). */
export type OperationalTransition =
  | "CALL"
  | "START"
  | "COMPLETE"
  | "DELAY"
  | "NO_SHOW"
  | "CANCEL";

export type TransitionGuardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export type TransitionContext = {
  /** موعد الهدف للانتقال (مطلوب لـ CALL عند غياب جلسة، ولـ NO_SHOW/CANCEL بدون جلسة). */
  targetAppointmentId?: number | null;
  /** موعد طوارئ (قناة whatsapp_emergency) — يتجاوز تصادم جلسة أخرى عند CALL. */
  isEmergencyTarget?: boolean;
};

/** يرمي عند رفض الحارس — مفيد للاختبارات وللتشديد التدريجي. */
export function assertOperationalTransitionAllowed(
  session: ActiveOperationalSession | null,
  transition: OperationalTransition,
  ctx: TransitionContext = {},
): void {
  const r = canTransition(session, transition, ctx);
  if (!r.allowed) {
    throw new Error(`[TRANSITION_BLOCKED] ${transition}: ${r.reason}`);
  }
}

export function getAllowedTransitions(
  session: ActiveOperationalSession | null,
  targetAppointmentId?: number | null,
): OperationalTransition[] {
  if (!session) {
    return ["CALL", "NO_SHOW", "CANCEL"];
  }

  switch (session.state) {
    case "WAITING": {
      if (targetAppointmentId != null && targetAppointmentId !== session.appointmentId) {
        return [];
      }
      return ["CALL", "NO_SHOW", "CANCEL"];
    }
    case "CALLED":
      return ["START", "DELAY", "NO_SHOW"];
    case "IN_PROGRESS":
      return ["COMPLETE"];
    default:
      return [];
  }
}

export function canTransition(
  session: ActiveOperationalSession | null,
  transition: OperationalTransition,
  ctx: TransitionContext = {},
): TransitionGuardResult {
  const targetId = ctx.targetAppointmentId ?? null;

  if (transition === "CALL") {
    if (!session) {
      if (targetId == null) {
        return { allowed: false, reason: "لم يُحدَّد موعد للاستدعاء." };
      }
      return { allowed: true };
    }
    if (ctx.isEmergencyTarget && targetId != null) {
      return { allowed: true };
    }
    if (session.state === "WAITING" && targetId != null && targetId === session.appointmentId) {
      return { allowed: true };
    }
    return { allowed: false, reason: "يوجد جلسة نشطة — أكملها أو ألغِها قبل استدعاء موعد آخر." };
  }

  /** ملكية جلسة واحدة: لا انتقال تشغيلي على موعد آخر أثناء CALLED / IN_PROGRESS. */
  if (
    session &&
    session.state !== "WAITING" &&
    targetId != null &&
    targetId !== session.appointmentId
  ) {
    return { allowed: false, reason: "جلسة نشطة على موعد آخر — أنهِها أو حرّر الجلسة أولًا." };
  }

  const allowed = getAllowedTransitions(session, targetId ?? session?.appointmentId ?? null);
  if (!allowed.includes(transition)) {
    return { allowed: false, reason: "غير مسموح في الحالة الحالية." };
  }

  if (transition === "NO_SHOW" || transition === "CANCEL" || transition === "DELAY" || transition === "COMPLETE") {
    if (!session && targetId == null) {
      return { allowed: false, reason: "لم يُحدَّد موعد." };
    }
  }

  return { allowed: true };
}

/**
 * صف «الآن» في الطابور: إذا كان الموعد طوارئ وجلسة أخرى نشطة، نسمح بعرض استدعاء الطوارئ فقط.
 */
export function getAllowedTransitionsForLeadRow(
  session: ActiveOperationalSession | null,
  leadAppointmentId: number | null | undefined,
  isEmergencyLead: boolean,
): OperationalTransition[] {
  const id = leadAppointmentId ?? null;
  const base = getAllowedTransitions(session, id);
  if (base.length > 0) return base;
  if (isEmergencyLead && id != null && session != null && session.appointmentId !== id) {
    return ["CALL"];
  }
  return base;
}
