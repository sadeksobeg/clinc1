/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { AppointmentRow } from "@/lib/ops-server";
import {
  getEffectiveDurationForProjection,
  getLearnedAverageMinutes,
  recordCompletedVisitMinutes,
  rememberCheckInAtBrowser,
  takeCheckInTimestampMs,
} from "@/lib/doctor-duration-learning";

function sampleAppt(doctorId: number | null = 7): AppointmentRow {
  return {
    id: 1,
    starts_at: "2026-05-01T07:00:00.000Z",
    ends_at: "2026-05-01T07:15:00.000Z",
    status: "confirmed",
    patient_id: 1,
    doctor_id: doctorId,
    patient_display_name: "P",
    doctor_name: "D",
    source_channel: null,
  };
}

describe("doctor-duration-learning", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("stores rolling average after two valid samples", () => {
    recordCompletedVisitMinutes(7, 10);
    expect(getLearnedAverageMinutes(7)).toBeNull();
    recordCompletedVisitMinutes(7, 20);
    expect(getLearnedAverageMinutes(7)).toBe(15);
  });

  it("blends learned average with fallback slot minutes", () => {
    recordCompletedVisitMinutes(7, 40);
    recordCompletedVisitMinutes(7, 40);
    const blended = getEffectiveDurationForProjection(sampleAppt(7), 12);
    expect(blended).toBe(26);
  });

  it("remembers check-in and returns timestamp once", () => {
    rememberCheckInAtBrowser(99);
    const t0 = takeCheckInTimestampMs(99);
    const t1 = takeCheckInTimestampMs(99);
    expect(typeof t0).toBe("number");
    expect(t0).toBeGreaterThan(0);
    expect(t1).toBeNull();
  });
});
