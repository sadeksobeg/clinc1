import type { DateTime } from "luxon";
import type { AppointmentRow } from "@/lib/ops-server";
import type { WorkspaceMode } from "@/hooks/use-ui-preferences";
import { toClinicZoned } from "@/lib/format";
import {
  ARRIVAL_GRACE_MINUTES,
  ARRIVAL_REMIND_MINUTES,
  ratingRequestText,
} from "@/lib/clinic-message-templates";
import { isLateAfterGrace } from "@/lib/clinic-time";
import { appointmentIsActiveNow, type ClinicDayOperationsResult } from "@/features/appointments/use-clinic-day-operations";

export type AppointmentPrimaryActionResult = {
  showPrimary: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  late: boolean;
  isNow: boolean;
  checkedInUi: boolean;
  statusRaw: string;
  arrivalRaw: string;
  canOperate: boolean;
  inReminderWindow: boolean;
  startLocal: DateTime | null;
};

type PatchFn = ClinicDayOperationsResult["patchAppointmentOptimistic"];
type SendFn = ClinicDayOperationsResult["sendOperationalToPatient"];
type OpenConvFn = ClinicDayOperationsResult["openPatientConversation"];

/**
 * Shared primary CTA for queue cards and operational timeline rows (same rules as legacy queue column).
 */
export function computeAppointmentPrimaryAction(
  a: AppointmentRow,
  st: DateTime,
  args: {
    nowZoned: DateTime;
    clinicTimezone: string;
    workspaceMode: WorkspaceMode;
    patchAppointmentOptimistic: PatchFn;
    sendOperationalToPatient: SendFn;
    openPatientConversation: OpenConvFn;
  },
): AppointmentPrimaryActionResult {
  const { nowZoned, clinicTimezone, workspaceMode, patchAppointmentOptimistic, sendOperationalToPatient, openPatientConversation } =
    args;
  const isDoctorMode = workspaceMode === "doctor";

  const startLocal = toClinicZoned(a.starts_at, clinicTimezone);
  const endLocal = toClinicZoned(a.ends_at, clinicTimezone);
  const isEmergency = a.source_channel === "whatsapp_emergency";
  const statusRaw = String(a.status || "").toLowerCase();
  const arrivalRaw = String(a.patient_arrival_state || "").toLowerCase();
  const isNow = Boolean(startLocal && appointmentIsActiveNow(a, nowZoned, startLocal, endLocal));
  const checkedInUi = arrivalRaw === "checked_in" && statusRaw !== "cancelled" && statusRaw !== "completed";
  const late =
    !isEmergency &&
    statusRaw !== "cancelled" &&
    statusRaw !== "completed" &&
    startLocal != null &&
    isLateAfterGrace(startLocal, nowZoned, ARRIVAL_GRACE_MINUTES);
  const canOperate = statusRaw !== "cancelled" && statusRaw !== "completed";

  let showPrimary = false;
  let primaryLabel = "";
  let onPrimary: () => void = () => {};

  if (canOperate) {
    if (isEmergency) {
      showPrimary = true;
      primaryLabel = "استقبال فوري";
      onPrimary = () =>
        void patchAppointmentOptimistic(a.id, { patient_arrival_state: "checked_in" }, "استقبال طارئ", {
          source: "ui_surface",
        });
    } else if (checkedInUi && isNow) {
      showPrimary = true;
      primaryLabel = "إنهاء الكشف";
      onPrimary = () =>
        void patchAppointmentOptimistic(a.id, { status: "completed" }, "إنهاء الكشف", {
          source: "ui_surface",
          afterSuccess: async () => {
            const pid = a.patient_id;
            if (!pid) return;
            await sendOperationalToPatient(pid, ratingRequestText(), "التقييم", {
              type: "rating",
              appointmentId: a.id,
            });
          },
        });
    } else if (checkedInUi && !isNow) {
      if (isDoctorMode && a.patient_id) {
        showPrimary = true;
        primaryLabel = "المحادثة";
        onPrimary = () => void openPatientConversation(a.patient_id!);
      }
    } else if (isNow && !checkedInUi) {
      showPrimary = true;
      primaryLabel = "بدء الكشف";
      onPrimary = () =>
        void patchAppointmentOptimistic(a.id, { patient_arrival_state: "checked_in" }, "تسجيل الحضور", {
          source: "ui_surface",
        });
    } else {
      showPrimary = true;
      primaryLabel = "تسجيل الحضور";
      onPrimary = () =>
        void patchAppointmentOptimistic(a.id, { patient_arrival_state: "checked_in" }, "تسجيل الحضور", {
          source: "ui_surface",
        });
    }
  }

  const minutesUntil =
    startLocal != null ? Math.round(startLocal.diff(nowZoned, "minutes").minutes) : null;
  const inReminderWindow =
    Boolean(a.patient_id) &&
    startLocal != null &&
    minutesUntil != null &&
    minutesUntil > 0 &&
    minutesUntil <= ARRIVAL_REMIND_MINUTES;

  return {
    showPrimary,
    primaryLabel,
    onPrimary,
    late,
    isNow,
    checkedInUi,
    statusRaw,
    arrivalRaw,
    canOperate,
    inReminderWindow,
    startLocal,
  };
}
