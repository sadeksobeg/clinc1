import type { AppointmentRow } from "@/lib/ops-server";

/**
 * Intended operational lifecycle (maps from API `status` + optional `patient_arrival_state`).
 * Use for UX copy and docs; API remains source of truth for storage.
 */
export type AppointmentOperationalState =
  | "booked"
  | "confirmed"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "late"
  | "no_show"
  | "cancelled";

export function deriveAppointmentOperationalState(row: AppointmentRow): AppointmentOperationalState {
  const st = String(row.status || "").toLowerCase();
  const ar = String(row.patient_arrival_state || "").toLowerCase();

  if (st === "cancelled") return "cancelled";
  if (st === "completed") return "completed";
  if (st === "no_show" || ar === "no_show") return "no_show";
  if (ar === "checked_in") return st === "confirmed" || st === "pending" ? "in_progress" : "checked_in";
  if (ar === "late") return "late";
  if (st === "confirmed") return "confirmed";
  if (st === "pending") return "booked";
  return "booked";
}
