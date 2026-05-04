import { DateTime } from "luxon";

import type { AppointmentRow } from "@/lib/ops-server";

export function appointmentOperationalStyle(
  a: AppointmentRow,
  ctx: { isNow: boolean; isLate: boolean; checkedIn: boolean },
): { bg: string; border: string; text: string; effects: string } {
  const status = String(a.status || "").toLowerCase();
  if (a.source_channel === "whatsapp_emergency") {
    return {
      bg: "bg-danger/10",
      border: "border-danger/60",
      text: "text-danger",
      effects: "shadow-lg shadow-danger/15 clinic-motion clinic-ops-emergency",
    };
  }
  if (status === "cancelled") {
    return { bg: "bg-muted/30", border: "border-border/60", text: "text-muted-foreground", effects: "" };
  }
  if (status === "completed") {
    return {
      bg: "bg-muted/25",
      border: "border-border/40",
      text: "text-muted-foreground",
      effects: "opacity-65 grayscale-[0.35]",
    };
  }
  if (ctx.checkedIn && ctx.isNow) {
    return {
      bg: "bg-success/12",
      border: "border-success/65",
      text: "text-success",
      effects: "ring-1 ring-success/30 shadow-sm",
    };
  }
  if (ctx.isNow) {
    return {
      bg: "bg-primary/12",
      border: "border-primary",
      text: "text-primary",
      effects: "shadow-[0_0_28px_-8px] shadow-primary/45 ring-2 ring-primary/35 clinic-motion clinic-ops-now",
    };
  }
  if (ctx.checkedIn) {
    return {
      bg: "bg-success/10",
      border: "border-success/55",
      text: "text-success",
      effects: "",
    };
  }
  if (ctx.isLate) {
    return {
      bg: "bg-warning/15",
      border: "border-warning",
      text: "text-warning",
      effects: "clinic-motion clinic-ops-late clinic-ops-late-halo",
    };
  }
  return {
    bg: "bg-primary/5",
    border: "border-primary/20",
    text: "text-primary",
    effects: "",
  };
}

export function isCompletedStatus(status: string | null | undefined): boolean {
  return String(status || "").toLowerCase() === "completed";
}

export function isCancelledStatus(status: string | null | undefined): boolean {
  return String(status || "").toLowerCase() === "cancelled";
}

export function appointmentIsActiveNow(
  a: AppointmentRow,
  now: DateTime,
  start: DateTime,
  end: DateTime | null,
): boolean {
  if (isCancelledStatus(a.status) || isCompletedStatus(a.status)) return false;
  const until = end ?? start.plus({ minutes: 30 });
  return now >= start && now < until;
}

export function isEmergencyAppointmentRow(a: AppointmentRow | null | undefined): boolean {
  return a?.source_channel === "whatsapp_emergency";
}
