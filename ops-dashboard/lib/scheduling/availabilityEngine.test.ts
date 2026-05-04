import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { iterateLocalSlots, intervalOverlapsBusy, pickFirstFreeSlots, type BusyInterval } from "./availabilityEngine";

describe("iterateLocalSlots", () => {
  it("returns slots within same day window", () => {
    const day = DateTime.fromObject({ year: 2026, month: 4, day: 18 }, { zone: "Asia/Amman" });
    // Closes 16:45 with 15m slots: last slot 16:30–16:45 is allowed (must end at/before close).
    const slots = iterateLocalSlots("Asia/Amman", day, "16:00:00", "16:45:00", 15);
    expect(slots.length).toBe(3);
    expect(slots[0].hour).toBe(16);
    expect(slots[0].minute).toBe(0);
    expect(slots[1].minute).toBe(15);
    expect(slots[2].minute).toBe(30);
  });
});

describe("intervalOverlapsBusy", () => {
  it("detects overlap", () => {
    const z = "Asia/Amman";
    const s = DateTime.fromObject({ year: 2026, month: 4, day: 18, hour: 16, minute: 0 }, { zone: z });
    const e = s.plus({ minutes: 15 });
    const busy: BusyInterval[] = [
      {
        start: DateTime.fromObject({ year: 2026, month: 4, day: 18, hour: 16, minute: 10 }, { zone: z }),
        end: DateTime.fromObject({ year: 2026, month: 4, day: 18, hour: 16, minute: 20 }, { zone: z }),
      },
    ];
    expect(intervalOverlapsBusy(s, e, busy)).toBe(true);
  });
});

describe("pickFirstFreeSlots", () => {
  it("picks free slots skipping busy", () => {
    const z = "Asia/Amman";
    const day = DateTime.fromObject({ year: 2026, month: 4, day: 18 }, { zone: z });
    const hours = new Map<number, { opens: string; closes: string }>();
    hours.set(6, { opens: "16:00:00", closes: "17:00:00" });
    const busyUtc: BusyInterval[] = [
      {
        start: DateTime.fromObject({ year: 2026, month: 4, day: 18, hour: 16, minute: 0 }, { zone: z }).toUTC(),
        end: DateTime.fromObject({ year: 2026, month: 4, day: 18, hour: 16, minute: 15 }, { zone: z }).toUTC(),
      },
    ];
    const nowUtc = DateTime.fromObject({ year: 2026, month: 4, day: 18, hour: 15, minute: 0 }, { zone: z }).toUTC();
    const picked = pickFirstFreeSlots(z, [day], hours, 15, busyUtc, 2, nowUtc, 2);
    expect(picked.length).toBeGreaterThanOrEqual(1);
    const first = picked[0].startUtc.setZone(z);
    expect(first.hour).toBe(16);
    expect(first.minute).toBe(15);
  });
});
