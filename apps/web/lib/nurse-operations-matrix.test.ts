import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import type { AppointmentRow } from "@/lib/ops-server";
import { canPerformAction, isInProgress } from "@/lib/clinic-brain/permissions";
import { pickNextToCall, loadLevel } from "@/lib/clinic-brain/selection";
import { suggestWalkInPlacement } from "@/lib/clinic-brain/walkin";
import {
  appointmentIsActiveNow,
  appointmentOperationalStyle,
} from "@/lib/operational-appointment";
import {
  buildDayQueueEngineState,
  classifyQueueBucket,
  groupEnrichedForOpsPanels,
  isAppointmentDone,
  pickCalendarNextAppointment,
  pickServeNextAppointment,
  type EnrichedDayAppointment,
} from "@/lib/scheduling-engine";

const ZONE = "Asia/Amman";

function appt(over: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 1,
    starts_at: "2026-05-02T05:00:00.000Z",
    ends_at: "2026-05-02T05:15:00.000Z",
    status: "confirmed",
    patient_arrival_state: "expected",
    patient_id: 10,
    doctor_id: 7,
    patient_display_name: "مريض تجريبي",
    doctor_name: "Doctor 1",
    source_channel: null,
    ...over,
  };
}

/** 2026-05-02 08:00 بتوقيت عمّان ≈ 05:00Z */
const ST = DateTime.fromObject({ year: 2026, month: 5, day: 2, hour: 8, minute: 0 }, { zone: ZONE });
const EN = ST.plus({ minutes: 15 });

describe("operational-appointment / مظهر البطاقة (لوحة الممرضة + التقويم)", () => {
  const cases: Array<{
    id: string;
    a: AppointmentRow;
    ctx: { isNow: boolean; isLate: boolean; checkedIn: boolean };
    expectEffectsIncludes: string;
  }> = [
    {
      id: "طوارئ واتساب",
      a: appt({ source_channel: "whatsapp_emergency" }),
      ctx: { isNow: false, isLate: false, checkedIn: false },
      expectEffectsIncludes: "clinic-ops-emergency",
    },
    {
      id: "ملغى",
      a: appt({ status: "cancelled" }),
      ctx: { isNow: true, isLate: true, checkedIn: true },
      expectEffectsIncludes: "",
    },
    {
      id: "منتهٍ",
      a: appt({ status: "completed" }),
      ctx: { isNow: true, isLate: false, checkedIn: true },
      expectEffectsIncludes: "grayscale",
    },
    {
      id: "داخل + نافذة الآن (ثابت)",
      a: appt({ patient_arrival_state: "checked_in" }),
      ctx: { isNow: true, isLate: false, checkedIn: true },
      expectEffectsIncludes: "ring-success",
    },
    {
      id: "نافذة الآن بدون حضور",
      a: appt(),
      ctx: { isNow: true, isLate: false, checkedIn: false },
      expectEffectsIncludes: "clinic-ops-now",
    },
    {
      id: "مسجّل دخول خارج نافذة الآن",
      a: appt({ patient_arrival_state: "checked_in" }),
      ctx: { isNow: false, isLate: false, checkedIn: true },
      expectEffectsIncludes: "",
    },
    {
      id: "متأخر",
      a: appt(),
      ctx: { isNow: false, isLate: true, checkedIn: false },
      expectEffectsIncludes: "clinic-ops-late",
    },
    {
      id: "عادي (قادم)",
      a: appt(),
      ctx: { isNow: false, isLate: false, checkedIn: false },
      expectEffectsIncludes: "",
    },
  ];

  it.each(cases)("$id: tone.bg ثابت ومُدار بالسياق", ({ a, ctx, expectEffectsIncludes }) => {
    const t = appointmentOperationalStyle(a, ctx);
    expect(t.bg).toMatch(/^bg-/);
    expect(t.border).toMatch(/^border-/);
    expect(t.text).toMatch(/^text-/);
    if (expectEffectsIncludes) {
      expect(t.effects).toContain(expectEffectsIncludes);
    }
  });

  it("الطوارئ تتقدّم على حالة confirmed عادية في المظهر", () => {
    const t = appointmentOperationalStyle(
      appt({ source_channel: "whatsapp_emergency", status: "confirmed" }),
      { isNow: true, isLate: false, checkedIn: false },
    );
    expect(t.effects).toContain("emergency");
  });
});

describe("appointmentIsActiveNow / نافذة الكشف الفعلية", () => {
  it("داخل النافذة [start, end)", () => {
    const a = appt();
    const mid = ST.plus({ minutes: 5 });
    expect(appointmentIsActiveNow(a, mid, ST, EN)).toBe(true);
  });

  it("عند start بالضبط يُعتبر داخلًا", () => {
    const a = appt();
    expect(appointmentIsActiveNow(a, ST, ST, EN)).toBe(true);
  });

  it("عند end يُعتبر خارجًا", () => {
    const a = appt();
    expect(appointmentIsActiveNow(a, EN, ST, EN)).toBe(false);
  });

  it("بعد انتهاء الموعد يكون خاطئًا", () => {
    const a = appt();
    expect(appointmentIsActiveNow(a, EN.plus({ seconds: 1 }), ST, EN)).toBe(false);
  });

  it("end الفارغ يوسّع النافذة 30 د افتراضيًا", () => {
    const a = appt();
    const withoutEnd = { ...a, ends_at: "" };
    const within = ST.plus({ minutes: 20 });
    expect(appointmentIsActiveNow(withoutEnd, within, ST, null)).toBe(true);
  });

  it("ملغى/منتهٍ لا يُعدّان نشطين أبدًا", () => {
    expect(appointmentIsActiveNow(appt({ status: "cancelled" }), ST.plus({ minutes: 5 }), ST, EN)).toBe(false);
    expect(appointmentIsActiveNow(appt({ status: "completed" }), ST.plus({ minutes: 5 }), ST, EN)).toBe(false);
  });
});

describe("classifyQueueBucket / أقسام الطابور", () => {
  it('DONE لحالات "منتهي"', () => {
    expect(
      classifyQueueBucket({
        appointment: appt({ status: "completed" }),
        localStart: ST,
        localEnd: EN,
        now: ST,
        graceMinutes: 15,
        slotFallbackMinutes: 15,
      }),
    ).toBe("DONE");
  });

  it("EMERGENCY لقناة الطوارئ", () => {
    expect(
      classifyQueueBucket({
        appointment: appt({ source_channel: "whatsapp_emergency" }),
        localStart: ST,
        localEnd: EN,
        now: ST,
        graceMinutes: 15,
        slotFallbackMinutes: 15,
      }),
    ).toBe("EMERGENCY");
  });

  it("NOW عند checked_in ونافذة الزيارة نشطة", () => {
    const now = ST.plus({ minutes: 5 });
    expect(
      classifyQueueBucket({
        appointment: appt({ patient_arrival_state: "checked_in" }),
        localStart: ST,
        localEnd: EN,
        now,
        graceMinutes: 15,
        slotFallbackMinutes: 15,
      }),
    ).toBe("NOW");
  });

  it("READY عند checked_in خارج النافذة", () => {
    const now = EN.plus({ hours: 1 });
    expect(
      classifyQueueBucket({
        appointment: appt({ patient_arrival_state: "checked_in" }),
        localStart: ST,
        localEnd: EN,
        now,
        graceMinutes: 15,
        slotFallbackMinutes: 15,
      }),
    ).toBe("READY");
  });

  it("LATE بعد فترة السماح", () => {
    const now = ST.plus({ minutes: 30 });
    expect(
      classifyQueueBucket({
        appointment: appt({ patient_arrival_state: "expected" }),
        localStart: ST,
        localEnd: EN,
        now,
        graceMinutes: 15,
        slotFallbackMinutes: 15,
      }),
    ).toBe("LATE");
  });

  it("UPCOMING قبل البدء وضمن السماح", () => {
    const now = ST.minus({ minutes: 10 });
    expect(
      classifyQueueBucket({
        appointment: appt(),
        localStart: ST,
        localEnd: EN,
        now,
        graceMinutes: 15,
        slotFallbackMinutes: 15,
      }),
    ).toBe("UPCOMING");
  });
});

describe("groupEnrichedForOpsPanels / أعمدة لوحة الممرضة", () => {
  const mk = (id: number, bucket: Parameters<typeof groupEnrichedForOpsPanels>[0][number]["bucket"]) =>
    ({
      appointment: appt({ id, patient_id: id, patient_display_name: `P${id}` }),
      localStart: ST.plus({ minutes: id }),
      bucket,
    }) as const;

  it("يَقسّم الطوارئ والمتأخرين والداخل والقادم", () => {
    const enriched = [
      mk(1, "EMERGENCY"),
      mk(2, "LATE"),
      mk(3, "NOW"),
      mk(4, "READY"),
      mk(5, "UPCOMING"),
      mk(6, "DONE"),
    ] as EnrichedDayAppointment[];

    const g = groupEnrichedForOpsPanels(enriched);
    expect(g.emergencies.map((e) => e.appointment.id)).toEqual([1]);
    expect(g.lateItems.map((e) => e.appointment.id)).toEqual([2]);
    expect(g.checkedInItems.map((e) => e.appointment.id).sort()).toEqual([3, 4]);
    expect(g.upcomingItems.map((e) => e.appointment.id)).toEqual([5]);
  });
});

describe("pickServeNextAppointment + pickCalendarNext / من يُستدعى مقابل التقويم", () => {
  it("الطوارئ تسبق القادم في الاستدعاء التشغيلي", () => {
    const stUp = ST.plus({ hours: 1 });
    const stEm = ST.plus({ hours: 2 });
    const enriched = [
      { appointment: appt({ id: 1, source_channel: "whatsapp_emergency" }), localStart: stEm, bucket: "EMERGENCY" as const },
      { appointment: appt({ id: 2 }), localStart: stUp, bucket: "UPCOMING" as const },
    ];
    expect(pickServeNextAppointment(enriched)?.id).toBe(1);
  });

  it("التقويم: أقرب موعد بعد الآن", () => {
    const now = ST.plus({ minutes: 30 });
    const items = [
      { appointment: appt({ id: 10 }), localStart: ST },
      { appointment: appt({ id: 11 }), localStart: ST.plus({ hours: 2 }) },
    ];
    expect(pickCalendarNextAppointment(items, now)?.id).toBe(11);
  });
});

describe("buildDayQueueEngineState / حالة يوم كاملة", () => {
  it("nowAppointment يطابق الموعد ذا دلو NOW (داخل + مسجّل حضور)", () => {
    const items = [{ appointment: appt({ id: 1, patient_arrival_state: "checked_in" }), localStart: ST }];
    const now = ST.plus({ minutes: 5 });
    const state = buildDayQueueEngineState({
      items,
      now,
      clinicTimezone: ZONE,
      graceMinutes: 15,
      getSlotMinutes: () => 15,
    });
    expect(state.nowAppointment?.id).toBe(1);
    expect(state.enriched[0]?.bucket).toBe("NOW");
  });
});

describe("clinic-brain/permissions (لوحة الممرضة)", () => {
  it("منع no_show و cancel أثناء كشف جارٍ", () => {
    const a = appt({ patient_arrival_state: "checked_in" });
    expect(isInProgress(a, { isNow: true })).toBe(true);
    expect(canPerformAction("no_show", a, { isNow: true }).allowed).toBe(false);
    expect(canPerformAction("cancel", a, { isNow: true }).allowed).toBe(false);
  });

  it("check_in ممنوع إن سُجّل حضور مسبقًا", () => {
    const a = appt({ patient_arrival_state: "checked_in" });
    expect(canPerformAction("check_in", a, { isNow: true }).allowed).toBe(false);
  });

  it("finish يتطلب checked_in", () => {
    const a = appt({ patient_arrival_state: "expected" });
    expect(canPerformAction("finish", a, { isNow: true }).allowed).toBe(false);
  });
});

describe("clinic-brain/selection", () => {
  it("تعارض التقويم مقابل التشغيل", () => {
    const r = pickNextToCall({
      serveNext: appt({ id: 1 }),
      calendarNext: appt({ id: 2 }),
    });
    expect(r.isServeCalendarConflict).toBe(true);
    expect(r.appointment?.id).toBe(1);
  });

  it("loadLevel حرج عند ضغط المتأخرين", () => {
    expect(loadLevel({ lateCount: 3, checkedInCount: 0, projection: new Map() }).level).toBe("critical");
  });
});

describe("walk-in / إضافة سريعة", () => {
  it("يعيد اقتراح وقت عندما لا توجد مواعيد متبقية للطبيب", () => {
    const r = suggestWalkInPlacement({
      doctorDayAppointments: [],
      now: ST,
      clinicTimezone: ZONE,
      effectiveMinutesFor: () => 15,
    });
    expect(r.nextAvailableAt.isValid).toBe(true);
    expect(r.expectedDelayMinutes).toBeGreaterThanOrEqual(0);
  });
});

describe("isAppointmentDone", () => {
  it("يعامل no_show كنهاية", () => {
    expect(isAppointmentDone(appt({ status: "no_show" }))).toBe(true);
    expect(isAppointmentDone(appt({ status: "confirmed", patient_arrival_state: "no_show" }))).toBe(true);
  });
});
