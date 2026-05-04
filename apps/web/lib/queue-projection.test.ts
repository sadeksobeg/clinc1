import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import type { AppointmentRow } from "@/lib/ops-server";
import { maxDelayMinutesForDoctorName, projectQueueTimelineForDay } from "@/lib/queue-projection";

const ZONE = "Asia/Riyadh";
const DAY_KEY = "2026-05-01";

function utcIsoLocal(y: number, m: number, d: number, hour: number, minute: number) {
  return DateTime.fromObject({ year: y, month: m, day: d, hour, minute }, { zone: ZONE }).toUTC().toISO()!;
}

function at(
  hour: number,
  minute: number,
  durMin: number,
  id: number,
  doctorId: number,
  extras: Partial<AppointmentRow> = {},
): AppointmentRow {
  const starts_at = utcIsoLocal(2026, 5, 1, hour, minute);
  const ends_at = DateTime.fromISO(starts_at, { zone: "utc" }).plus({ minutes: durMin }).toUTC().toISO()!;
  return {
    id,
    starts_at,
    ends_at,
    status: "confirmed",
    patient_id: id,
    doctor_id: doctorId,
    patient_display_name: `Patient ${id}`,
    doctor_name: `Doctor ${doctorId}`,
    ...extras,
  };
}

describe("projectQueueTimelineForDay", () => {
  it("orders sequential slots without delay when queue is empty ahead", () => {
    const a1 = at(10, 0, 15, 1, 10);
    const a2 = at(10, 15, 15, 2, 10);
    const now = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 9, minute: 30 }, { zone: ZONE });
    const map = projectQueueTimelineForDay({
      appointments: [a1, a2],
      now,
      clinicTimezone: ZONE,
      dayKey: DAY_KEY,
      graceMinutes: 15,
      getEffectiveMinutes: () => 15,
    });
    const p1 = map.get(1)!;
    const p2 = map.get(2)!;
    expect(p1.projected_start.toFormat("HH:mm")).toBe("10:00");
    expect(p1.delay_minutes).toBe(0);
    expect(p2.projected_start.toFormat("HH:mm")).toBe("10:15");
    expect(p2.delay_minutes).toBe(0);
  });

  it("propagates delay when an in-progress visit pushes the cursor past the next scheduled start", () => {
    const a1 = at(10, 0, 45, 1, 10, {
      patient_arrival_state: "checked_in",
    });
    const a2 = at(10, 15, 15, 2, 10);
    const now = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 10, minute: 20 }, { zone: ZONE });
    const map = projectQueueTimelineForDay({
      appointments: [a1, a2],
      now,
      clinicTimezone: ZONE,
      dayKey: DAY_KEY,
      graceMinutes: 15,
      getEffectiveMinutes: () => 15,
    });
    const p2 = map.get(2)!;
    expect(p2.projected_start.toFormat("HH:mm")).toBe("10:45");
    expect(p2.delay_minutes).toBe(30);
  });

  it("does not mix queues across doctors", () => {
    const a1 = at(10, 0, 45, 1, 10, { patient_arrival_state: "checked_in" });
    const b1 = at(10, 15, 15, 2, 20);
    const now = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 10, minute: 10 }, { zone: ZONE });
    const map = projectQueueTimelineForDay({
      appointments: [a1, b1],
      now,
      clinicTimezone: ZONE,
      dayKey: DAY_KEY,
      graceMinutes: 15,
      getEffectiveMinutes: () =>15,
    });
    const pb = map.get(2)!;
    expect(pb.projected_start.toFormat("HH:mm")).toBe("10:15");
    expect(pb.delay_minutes).toBe(0);
  });

  it("excludes appointments on another clinic day", () => {
    const a1 = utcIsoLocal(2026, 5, 2, 10, 0);
    const appt: AppointmentRow = {
      id: 1,
      starts_at: a1,
      ends_at: DateTime.fromISO(a1, { zone: "utc" }).plus({ minutes: 15 }).toUTC().toISO()!,
      status: "confirmed",
      patient_id: 1,
      doctor_id: 1,
      patient_display_name: "P",
      doctor_name: "D",
    };
    const now = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 12, minute: 0 }, { zone: ZONE });
    const map = projectQueueTimelineForDay({
      appointments: [appt],
      now,
      clinicTimezone: ZONE,
      dayKey: DAY_KEY,
      graceMinutes: 15,
      getEffectiveMinutes: () => 15,
    });
    expect(map.size).toBe(0);
  });
});

describe("maxDelayMinutesForDoctorName", () => {
  it("returns highest delay for matching doctor_name", () => {
    const a1 = at(10, 0, 45, 1, 1, { patient_arrival_state: "checked_in", doctor_name: "د. سارة" });
    const a2 = at(10, 15, 15, 2, 1, { doctor_name: "د. سارة" });
    const now = DateTime.fromObject({ year: 2026, month: 5, day: 1, hour: 10, minute: 20 }, { zone: ZONE });
    const map = projectQueueTimelineForDay({
      appointments: [a1, a2],
      now,
      clinicTimezone: ZONE,
      dayKey: DAY_KEY,
      graceMinutes: 15,
      getEffectiveMinutes: () => 15,
    });
    expect(maxDelayMinutesForDoctorName(map, [a1, a2], "د. سارة")).toBe(30);
  });
});
