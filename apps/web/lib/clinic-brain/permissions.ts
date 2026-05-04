import type { AppointmentRow } from "@/lib/ops-server";

export type ClinicAction =
  | "check_in"
  | "start"
  | "finish"
  | "mark_late"
  | "no_show"
  | "cancel"
  | "reschedule"
  | "walk_in_create";

export type PermissionReason =
  | "ok"
  | "appointment_done"
  | "appointment_cancelled"
  | "appointment_in_progress"
  | "already_checked_in"
  | "not_yet_checked_in"
  | "already_late";

export type PermissionResult = {
  allowed: boolean;
  reason: PermissionReason;
};

export type PermissionContext = {
  /** isNow: موعد حالي ضمن نافذة الوقت. */
  isNow: boolean;
};

function statusOf(a: AppointmentRow): string {
  return String(a.status || "").toLowerCase();
}

function arrivalOf(a: AppointmentRow): string {
  return String(a.patient_arrival_state || "").toLowerCase();
}

/** «in_progress» مستنتجة — نعامل كشف جارٍ كحالة لا يُلغى معها الموعد ولا يُعلّم «لم يحضر». */
export function isInProgress(a: AppointmentRow, ctx: Pick<PermissionContext, "isNow">): boolean {
  return ctx.isNow && arrivalOf(a) === "checked_in" && statusOf(a) !== "completed" && statusOf(a) !== "cancelled";
}

export function canPerformAction(
  action: ClinicAction,
  appointment: AppointmentRow,
  ctx: PermissionContext,
): PermissionResult {
  const status = statusOf(appointment);
  const arrival = arrivalOf(appointment);

  if (status === "cancelled") return { allowed: false, reason: "appointment_cancelled" };
  if (status === "completed" || status === "no_show") return { allowed: false, reason: "appointment_done" };

  const inProgress = isInProgress(appointment, ctx);

  switch (action) {
    case "no_show":
    case "cancel":
      if (inProgress) return { allowed: false, reason: "appointment_in_progress" };
      return { allowed: true, reason: "ok" };

    case "check_in":
      if (arrival === "checked_in") return { allowed: false, reason: "already_checked_in" };
      return { allowed: true, reason: "ok" };

    case "start":
      if (arrival !== "checked_in") return { allowed: false, reason: "not_yet_checked_in" };
      return { allowed: true, reason: "ok" };

    case "finish":
      if (arrival !== "checked_in") return { allowed: false, reason: "not_yet_checked_in" };
      return { allowed: true, reason: "ok" };

    case "mark_late":
      if (arrival === "late") return { allowed: false, reason: "already_late" };
      return { allowed: true, reason: "ok" };

    case "reschedule":
      if (inProgress) return { allowed: false, reason: "appointment_in_progress" };
      return { allowed: true, reason: "ok" };

    case "walk_in_create":
      return { allowed: true, reason: "ok" };
  }
}

export function permissionMessage(reason: PermissionReason): string {
  switch (reason) {
    case "appointment_in_progress":
      return "لا يمكن تنفيذ هذا الإجراء أثناء كشف جارٍ.";
    case "appointment_cancelled":
      return "الموعد ملغي.";
    case "appointment_done":
      return "الموعد مكتمل.";
    case "already_checked_in":
      return "المريض مسجل الدخول بالفعل.";
    case "not_yet_checked_in":
      return "يجب تسجيل الحضور أولًا.";
    case "already_late":
      return "الموعد مُعلَّم كمتأخر مسبقًا.";
    case "ok":
      return "";
  }
}
