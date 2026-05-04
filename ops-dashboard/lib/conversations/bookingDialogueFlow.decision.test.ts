import { describe, it, expect } from "vitest";
import { pickClinicIndexByHint } from "@/lib/ai/bookingEntityExtract";
import { specialtySearchTokenFromText } from "@/lib/ai/doctorMatch";

describe("specialtySearchTokenFromText", () => {
  it("maps Arabic eye doctor phrasing to ophthalm token", () => {
    expect(specialtySearchTokenFromText("بدي دكتور عيون بكرا", "عيون", null)).toBe("ophthalm");
  });

  it("uses interpret specialty slug when present", () => {
    expect(specialtySearchTokenFromText("حجز", null, "ophthalmology")).toBe("ophthalmology");
  });

  it("maps dental colloquial", () => {
    expect(specialtySearchTokenFromText("عندي وجع اسنان", null, null)).toBe("dent");
  });
});

describe("pickClinicIndexByHint for AI clinic_hint jumps", () => {
  it("resolves clinic name substring to list ix", () => {
    const picks = [
      { ix: 1, clinic_id: 10, name: "الفرع الرئيسي" },
      { ix: 2, clinic_id: 11, name: "فرع الجنوب" },
    ];
    expect(pickClinicIndexByHint(picks, "الرئيسي")).toBe(1);
    expect(pickClinicIndexByHint(picks, "الجنوب")).toBe(2);
  });
});
