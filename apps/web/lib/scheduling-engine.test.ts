import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import type { AppointmentRow } from "@/lib/ops-server";
import { classifyQueueBucket, isAppointmentDone, pickServeNextAppointment } from "@/lib/scheduling-engine";

const ZONE = "Asia/Riyadh";

function appt(overrides: Partial<AppointmentRow>): AppointmentRow {
  return {
    id: 1,
    starts_at: "2026-05-01T07:00:00.000Z",
    ends_at: "2026-05-01T07:15:00.000Z",
    status: "confirmed",
    patient_id: 1,
    doctor_id: 1,
    patient_display_name: "P",
    doctor_name: "D",
    ...overrides,
  };
}

describe("isAppointmentDone", () => {
  it("treats completed, cancelled, and no_show as done", () => {
    expect(isAppointmentDone(appt({ status: "completed" }))).toBe(true);
    expect(isAppointmentDone(appt({ status: "cancelled" }))).toBe(true);
    expect(isAppointmentDone(appt({ status: "no_show" }))).toBe(true);
    expect(isAppointmentDone(appt({ status: "confirmed", patient_arrival_state: "no_show" }))).toBe(true);
  });

  it("treats active bookings as not done", () => {
    expect(isAppointmentDone(appt({ status: "confirmed" }))).toBe(false);
    expect(isAppointmentDone(appt({ status: "confirmed", patient_arrival_state: "checked_in" }))).toBe(false);
  });
});

describe("classifyQueueBucket", () => {
  const st = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 10, minute: 0 }, { zone: ZONE });
  const en = st.plus({ minutes: 15 });

  it("returns EMERGENCY for whatsapp_emergency channel", () => {
    expect(
      classifyQueueBucket({
        appointment: appt({ source_channel: "whatsapp_emergency" }),
        localStart: st,
        localEnd: en,
        now: st,
        graceMinutes: 15,
        slotFallbackMinutes: 15,
      }),
    ).toBe("EMERGENCY");
  });

  it("returns NOW when checked_in and inside visit window", () => {
    const now = st.plus({ minutes: 5 });
    expect(
      classifyQueueBucket({
        appointment: appt({ patient_arrival_state: "checked_in" }),
        localStart: st,
        localEnd: en,
        now,
        graceMinutes: 15,
        slotFallbackMinutes: 15,
      }),
    ).toBe("NOW");
  });
});

describe("pickServeNextAppointment", () => {
  it("prefers EMERGENCY over UPCOMING", () => {
    const st1 = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 9, minute: 0 }, { zone: ZONE });
    const st2 = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 9, minute: 30 }, { zone: ZONE });
    const emerg = appt({
      id: 1,
      source_channel: "whatsapp_emergency",
      patient_display_name: "E",
    });
    const up = appt({ id: 2, patient_display_name: "U" });
    const next = pickServeNextAppointment([
      { appointment: emerg, localStart: st2, bucket: "EMERGENCY" },
      { appointment: up, localStart: st1, bucket: "UPCOMING" },
    ]);
    expect(next?.id).toBe(1);
  });
});
