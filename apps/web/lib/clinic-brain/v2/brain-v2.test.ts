/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import type { AppointmentRow } from "@/lib/ops-server";
import type { ProjectedSlot } from "@/lib/queue-projection";

import type { AppointmentProjection } from "./projection";
import { enrichProjectionsForDay, riskLevelFromDelay } from "./projection";
import { effectiveMinutesV2, inferCaseKind } from "./duration";
import { evaluateSla } from "./sla";
import { compareOperationalPriority, groupSameScheduledMinute, resolveConflictOrder } from "./conflict";
import { buildBrainSuggestions } from "./decision";
import { pickNextToCall } from "@/lib/clinic-brain/selection";

function appt(over: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 1,
    starts_at: "2026-05-01T10:00:00.000Z",
    ends_at: "2026-05-01T10:15:00.000Z",
    status: "confirmed",
    patient_arrival_state: "expected",
    patient_id: 1,
    doctor_id: 7,
    patient_display_name: "A",
    doctor_name: "D",
    source_channel: null,
    notes: null,
    ...over,
  };
}

describe("brain v2 / projection", () => {
  it("riskLevelFromDelay thresholds", () => {
    expect(riskLevelFromDelay(5)).toBe("low");
    expect(riskLevelFromDelay(15)).toBe("medium");
    expect(riskLevelFromDelay(25)).toBe("high");
  });

  it("enrichProjectionsForDay adds confidence and risk", () => {
    const a = appt({ id: 10 });
    const slot: ProjectedSlot = {
      id: 10,
      doctor_id: 7,
      scheduled_start: DateTime.utc(),
      projected_start: DateTime.utc(),
      projected_end: DateTime.utc().plus({ minutes: 15 }),
      delay_minutes: 22,
      bucket: "UPCOMING",
    };
    const raw = new Map([[10, slot]]);
    const enriched = enrichProjectionsForDay({
      raw,
      appointments: [a],
      clinicTimezone: "UTC",
    });
    const p = enriched.get(10);
    expect(p?.risk_level).toBe("high");
    expect(p?.confidence).toBeGreaterThanOrEqual(15);
    expect(p?.confidence).toBeLessThanOrEqual(98);
  });
});

describe("brain v2 / duration", () => {
  it("inferCaseKind from notes and channel", () => {
    expect(inferCaseKind(appt({ source_channel: "whatsapp_emergency" }))).toBe("emergency");
    expect(inferCaseKind(appt({ notes: "متابعة دورية" }))).toBe("followup");
    expect(inferCaseKind(appt({ notes: null }))).toBe("new_case");
  });

  it("effectiveMinutesV2 scales base by case", () => {
    const base = effectiveMinutesV2({
      appointment: appt({ notes: null }),
      doctorSlotMinutes: 15,
      caseKind: "new_case",
    });
    expect(base.minutes).toBeGreaterThanOrEqual(5);
    const fu = effectiveMinutesV2({
      appointment: appt({ notes: "متابعة" }),
      doctorSlotMinutes: 15,
    });
    expect(fu.case_kind).toBe("followup");
  });
});

describe("brain v2 / sla", () => {
  it("suggests delay message when projection delay high", () => {
    const row: AppointmentProjection = {
      appointment_id: 1,
      expected_start: DateTime.utc(),
      expected_end: DateTime.utc().plus({ minutes: 15 }),
      delay_minutes: 25,
      confidence: 70,
      risk_level: "high",
      bucket: "UPCOMING",
    };
    const enriched = new Map<number, AppointmentProjection>([[1, row]]);
    const list = evaluateSla({
      enriched,
      appointments: [appt({ id: 1 })],
      now: DateTime.utc(),
      clinicTimezone: "UTC",
      dayKey: "2026-05-01",
    });
    expect(list.some((x) => x.kind === "send_delay_message")).toBe(true);
  });
});

describe("brain v2 / conflict", () => {
  const tz = "UTC";
  const start = (iso: string) => DateTime.fromISO(iso, { zone: tz });

  it("resolveConflictOrder prefers emergency then checked_in", () => {
    const getLocal = (x: AppointmentRow) => start(x.starts_at);
    const a = appt({ id: 1, starts_at: "2026-05-01T10:00:00.000Z", source_channel: null });
    const b = appt({
      id: 2,
      starts_at: "2026-05-01T10:00:00.000Z",
      source_channel: "whatsapp_emergency",
    });
    const c = appt({
      id: 3,
      starts_at: "2026-05-01T10:00:00.000Z",
      patient_arrival_state: "checked_in",
    });
    const ordered = resolveConflictOrder([a, b, c], getLocal);
    expect(ordered[0]?.id).toBe(2);
    expect(ordered[1]?.id).toBe(3);
  });

  it("groupSameScheduledMinute finds collisions", () => {
    const getLocal = (x: AppointmentRow) => start(x.starts_at);
    const g = groupSameScheduledMinute(
      [
        appt({ id: 1, starts_at: "2026-05-01T10:00:00.000Z" }),
        appt({ id: 2, starts_at: "2026-05-01T10:00:00.000Z" }),
        appt({ id: 3, starts_at: "2026-05-01T11:00:00.000Z" }),
      ],
      getLocal,
    );
    expect(g.length).toBe(1);
    expect(g[0]?.length).toBe(2);
  });
});

describe("brain v2 / decision", () => {
  it("buildBrainSuggestions merges SLA and conflict flag", () => {
    const serve = appt({ id: 5 });
    const cal = appt({ id: 6, starts_at: "2026-05-01T10:30:00.000Z" });
    const next = pickNextToCall({ serveNext: serve, calendarNext: cal });
    const sug = buildBrainSuggestions({
      serveNext: next.serveNext,
      calendarNext: next.calendarNext,
      isServeCalendarConflict: next.isServeCalendarConflict,
      sla: [
        {
          kind: "send_delay_message",
          reason: "test",
          appointment_id: 5,
          metrics: { delay_minutes: 18 },
        },
      ],
      loadLevel: "high",
      enrichedByAppointmentId: new Map(),
    });
    expect(sug.some((s) => s.action === "call_next")).toBe(true);
    expect(sug.some((s) => s.action === "review_conflict")).toBe(true);
    expect(sug.some((s) => s.action === "escalate_load")).toBe(true);
    for (const s of sug) {
      expect(typeof s.autoExecutable).toBe("boolean");
      expect(typeof s.requiresConfirmation).toBe("boolean");
    }
  });
});
