import type { AppointmentRow } from "@/lib/ops-server";
import { estimateVisitMinutes } from "@/lib/scheduling-engine";
import { getLearnedAverageMinutes } from "@/lib/doctor-duration-learning";

/**
 * Case modifiers (until API exposes case_type).
 * followup: −30% · new_case: +20% · emergency: +50% on top of base, plus buffer.
 */
export type CaseKind = "followup" | "new_case" | "emergency";

export type EffectiveDurationV2Result = {
  minutes: number;
  case_kind: CaseKind;
  base_minutes: number;
  /** Multiplier applied to base (e.g. 1.2 for +20%). */
  modifier_factor: number;
  emergency_buffer_minutes: number;
};

export function inferCaseKind(appointment: AppointmentRow): CaseKind {
  if (appointment.source_channel === "whatsapp_emergency") return "emergency";
  const n = String(appointment.notes ?? "").toLowerCase();
  if (
    /\b(follow|followup|follow-up)\b/i.test(n) ||
    /متابعة|إعادة|اعادة|مراجعة/.test(n)
  ) {
    return "followup";
  }
  return "new_case";
}

/** Returns additive modifier for (1 + m) multiplier per product spec. */
export function caseModifierFraction(kind: CaseKind): number {
  switch (kind) {
    case "followup":
      return -0.3;
    case "new_case":
      return 0.2;
    case "emergency":
      return 0.5;
  }
}

const EMERGENCY_EXTRA_MINUTES = 8;

/**
 * effectiveDuration =
 *   base (doctor last-20 avg when available, else blended estimate)
 *   × (1 + case_modifier)
 *   + emergency_buffer
 */
export function effectiveMinutesV2(args: {
  appointment: AppointmentRow;
  doctorSlotMinutes: number;
  /** Force case kind (e.g. from future API). */
  caseKind?: CaseKind;
}): EffectiveDurationV2Result {
  const { appointment, doctorSlotMinutes } = args;
  const kind = args.caseKind ?? inferCaseKind(appointment);

  const learned = getLearnedAverageMinutes(appointment.doctor_id);
  const estimated = estimateVisitMinutes(appointment, doctorSlotMinutes);
  const base =
    learned != null ? Math.round(0.55 * learned + 0.45 * estimated) : estimated;

  const frac = caseModifierFraction(kind);
  const factor = 1 + frac;
  let minutes = Math.round(base * factor);
  let emergency_buffer_minutes = 0;
  if (kind === "emergency") {
    emergency_buffer_minutes = EMERGENCY_EXTRA_MINUTES;
    minutes += emergency_buffer_minutes;
  }

  minutes = Math.max(5, Math.min(180, minutes));

  return {
    minutes,
    case_kind: kind,
    base_minutes: base,
    modifier_factor: factor,
    emergency_buffer_minutes,
  };
}
