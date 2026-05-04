import type { DateTime } from "luxon";
import type { AppointmentRow } from "@/lib/ops-server";
import type { ProjectedSlot } from "@/lib/queue-projection";
import { getLearnedSampleCount } from "@/lib/doctor-duration-learning";
import { toClinicZoned } from "@/lib/format";

/** Decision-grade projection: expectation + confidence + risk (not display-only). */
export type RiskLevel = "low" | "medium" | "high";

export type AppointmentProjection = {
  appointment_id: number;
  expected_start: DateTime;
  expected_end: DateTime;
  delay_minutes: number;
  confidence: number;
  risk_level: RiskLevel;
  bucket: ProjectedSlot["bucket"];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Rule: delay > 20 → high; > 10 → medium; else low. */
export function riskLevelFromDelay(delayMinutes: number): RiskLevel {
  if (delayMinutes > 20) return "high";
  if (delayMinutes > 10) return "medium";
  return "low";
}

function hasValidEndWindow(a: AppointmentRow, clinicTimezone: string): boolean {
  const st = toClinicZoned(a.starts_at, clinicTimezone);
  const en = toClinicZoned(a.ends_at, clinicTimezone);
  if (!st?.isValid || !en?.isValid) return false;
  const mins = Math.round(en.diff(st, "minutes").minutes);
  return Number.isFinite(mins) && mins >= 5;
}

/**
 * Heuristic confidence 15–98:
 * — more learned samples for the doctor → higher
 * — scheduled end present → higher
 * — higher delay → lower (forecast noise)
 */
export function computeProjectionConfidence(args: {
  slot: ProjectedSlot;
  appointment: AppointmentRow;
  clinicTimezone: string;
  learnedSampleCountOverride?: number;
}): number {
  const { slot, appointment, clinicTimezone } = args;
  const samples =
    args.learnedSampleCountOverride ?? getLearnedSampleCount(appointment.doctor_id);
  let c = 55;
  c += Math.min(22, samples * 4);
  if (hasValidEndWindow(appointment, clinicTimezone)) c += 10;
  c -= Math.min(28, slot.delay_minutes * 1.1);
  return Math.round(clamp(c, 15, 98));
}

/** Enrich raw queue projection into operational AppointmentProjection map. */
export function enrichProjectionsForDay(args: {
  raw: Map<number, ProjectedSlot>;
  appointments: AppointmentRow[];
  clinicTimezone: string;
}): Map<number, AppointmentProjection> {
  const { raw, appointments, clinicTimezone } = args;
  const byId = new Map(appointments.map((a) => [a.id, a]));
  const out = new Map<number, AppointmentProjection>();

  raw.forEach((slot, id) => {
    const appointment = byId.get(id);
    if (!appointment) return;
    const delay = slot.delay_minutes;
    let risk = riskLevelFromDelay(delay);
    if (slot.bucket === "LATE" && risk === "low") risk = "medium";
    const confidence = computeProjectionConfidence({ slot, appointment, clinicTimezone });
    out.set(id, {
      appointment_id: id,
      expected_start: slot.projected_start,
      expected_end: slot.projected_end,
      delay_minutes: delay,
      confidence,
      risk_level: risk,
      bucket: slot.bucket,
    });
  });

  return out;
}
