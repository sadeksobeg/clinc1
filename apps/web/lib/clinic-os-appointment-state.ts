/**
 * Maps operational appointment situations to semantic UI tones.
 * Use with Badge variants / borders — not raw Tailwind palette classes.
 */

export type ClinicAppointmentUiTone = "danger" | "warning" | "success" | "secondary" | "info";

export type ClinicAppointmentUiBucket = "emergency" | "late" | "checked_in" | "completed" | "cancelled" | "default";

export function appointmentUiBucket(args: {
  status: string | null | undefined;
  patientArrivalState?: string | null | undefined;
  isDerivedLate?: boolean;
  isEmergencyChannel?: boolean;
}): ClinicAppointmentUiBucket {
  if (args.isEmergencyChannel) return "emergency";
  const st = String(args.status || "").toLowerCase();
  if (st === "cancelled") return "cancelled";
  if (st === "completed") return "completed";
  const arrival = String(args.patientArrivalState || "").toLowerCase();
  if (arrival === "checked_in") return "checked_in";
  if (args.isDerivedLate) return "late";
  return "default";
}

export function appointmentToneToBadgeVariant(tone: ClinicAppointmentUiBucket): ClinicAppointmentUiTone {
  switch (tone) {
    case "emergency":
      return "danger";
    case "late":
      return "warning";
    case "checked_in":
      return "success";
    case "completed":
      return "secondary";
    case "cancelled":
      return "secondary";
    default:
      return "info";
  }
}
