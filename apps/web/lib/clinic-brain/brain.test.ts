/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import type { AppointmentRow } from "@/lib/ops-server";

import { pickNextToCall, effectiveDuration, loadLevel } from "./selection";
import { canPerformAction, isInProgress } from "./permissions";
import {
  canSendMessage,
  clearMessageGuard,
  idempotencyKey,
  recordMessageSent,
} from "./messaging";
import { suggestWalkInPlacement } from "./walkin";

function appt(over: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 1,
    starts_at: "2026-05-01T07:00:00.000Z",
    ends_at: "2026-05-01T07:15:00.000Z",
    status: "confirmed",
    patient_arrival_state: "expected",
    patient_id: 10,
    doctor_id: 7,
    patient_display_name: "P",
    doctor_name: "D",
    source_channel: null,
    ...over,
  };
}

describe("clinic-brain/selection", () => {
  it("picks serveNext when serve = calendar", () => {
    const s = appt({ id: 1 });
    const c = appt({ id: 1 });
    const r = pickNextToCall({ serveNext: s, calendarNext: c });
    expect(r.appointment?.id).toBe(1);
    expect(r.isServeCalendarConflict).toBe(false);
  });

  it("flags conflict when serveNext differs from calendarNext", () => {
    const s = appt({ id: 1 });
    const c = appt({ id: 2 });
    const r = pickNextToCall({ serveNext: s, calendarNext: c });
    expect(r.appointment?.id).toBe(1);
    expect(r.isServeCalendarConflict).toBe(true);
  });

  it("effectiveDuration falls back through median → doctor slot → default", () => {
    const a = appt();
    const samples = new Map<number, number[]>([[7, [12, 14, 18, 22]]]);
    const med = effectiveDuration(a, { slot_duration_minutes: 20 }, samples);
    expect(med.source).toBe("historical_median");
    expect(med.minutes).toBeGreaterThan(0);

    const slot = effectiveDuration(a, { slot_duration_minutes: 20 });
    expect(slot.source === "doctor_slot" || slot.source === "learned_avg").toBe(true);

    const fallback = effectiveDuration(a, null);
    expect(["default", "learned_avg"]).toContain(fallback.source);
  });

  it("loadLevel reports critical on many late or large delay", () => {
    const r = loadLevel({ lateCount: 3, checkedInCount: 0, projection: new Map() });
    expect(r.level).toBe("critical");
  });
});

describe("clinic-brain/permissions", () => {
  it("blocks no_show and cancel while in_progress", () => {
    const a = appt({ patient_arrival_state: "checked_in", status: "confirmed" });
    expect(isInProgress(a, { isNow: true })).toBe(true);
    expect(canPerformAction("no_show", a, { isNow: true }).allowed).toBe(false);
    expect(canPerformAction("cancel", a, { isNow: true }).allowed).toBe(false);
  });

  it("allows no_show when not in_progress", () => {
    const a = appt({ patient_arrival_state: "expected" });
    expect(canPerformAction("no_show", a, { isNow: false }).allowed).toBe(true);
  });

  it("rejects actions on cancelled/completed appointments", () => {
    expect(canPerformAction("start", appt({ status: "cancelled" }), { isNow: false }).allowed).toBe(false);
    expect(canPerformAction("finish", appt({ status: "completed" }), { isNow: false }).allowed).toBe(false);
  });
});

describe("clinic-brain/messaging", () => {
  beforeEach(() => {
    localStorage.clear();
    clearMessageGuard();
  });

  it("blocks a second reminder for the same appointment", () => {
    const keyArgs = { patientId: 1, appointmentId: 42 };
    expect(canSendMessage("reminder", keyArgs).allowed).toBe(true);
    recordMessageSent("reminder", keyArgs);
    const blocked = canSendMessage("reminder", keyArgs);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("already_sent_once");
  });

  it("cooldown prevents spamming delay alerts within 15 minutes", () => {
    const keyArgs = { patientId: 2, appointmentId: 9 };
    const t0 = 1_000_000;
    expect(canSendMessage("delay", keyArgs, t0).allowed).toBe(true);
    recordMessageSent("delay", keyArgs, t0);
    const tSoon = t0 + 5 * 60 * 1000;
    const blocked = canSendMessage("delay", keyArgs, tSoon);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("cooldown");
    const tLater = t0 + 16 * 60 * 1000;
    expect(canSendMessage("delay", keyArgs, tLater).allowed).toBe(true);
  });

  it("stable idempotency key per (type, patient, appointment)", () => {
    expect(idempotencyKey("reminder", { patientId: 1, appointmentId: 2 })).toBe("ops-reminder-v1-1-2");
    expect(idempotencyKey("delay", { patientId: 1, appointmentId: null })).toBe("ops-delay-v1-1-na");
  });
});

describe("clinic-brain/walkin", () => {
  const tz = "UTC";

  it("places walk-in immediately when the doctor has no appointments", () => {
    const now = DateTime.fromISO("2026-05-01T10:00:00.000Z", { zone: "utc" });
    const r = suggestWalkInPlacement({
      doctorDayAppointments: [],
      now,
      clinicTimezone: tz,
      effectiveMinutesFor: () => 15,
    });
    expect(r.expectedDelayMinutes).toBe(0);
    expect(r.willDelaySubsequent).toBe(false);
  });

  it("projects delay after a busy doctor", () => {
    const now = DateTime.fromISO("2026-05-01T10:00:00.000Z", { zone: "utc" });
    const busy: AppointmentRow[] = [
      appt({
        id: 1,
        starts_at: "2026-05-01T10:00:00.000Z",
        ends_at: "2026-05-01T10:15:00.000Z",
        status: "confirmed",
      }),
      appt({
        id: 2,
        starts_at: "2026-05-01T10:10:00.000Z",
        ends_at: "2026-05-01T10:25:00.000Z",
        status: "confirmed",
      }),
    ];
    const r = suggestWalkInPlacement({
      doctorDayAppointments: busy,
      now,
      clinicTimezone: tz,
      effectiveMinutesFor: () => 15,
    });
    expect(r.expectedDelayMinutes).toBeGreaterThan(0);
    expect(r.willDelaySubsequent).toBe(true);
  });
});
