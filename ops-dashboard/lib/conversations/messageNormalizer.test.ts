import { describe, expect, it } from "vitest";
import { cleanArabicText, normalizeArabicMessage } from "./messageNormalizer";

describe("Arabic message normalizer", () => {
  describe("character normalization", () => {
    it("توحيد الألف: أريد = اريد", () => {
      expect(cleanArabicText("أريد")).toBe("اريد");
    });

    it("إزالة تشكيل: مَوعِد = موعد", () => {
      expect(cleanArabicText("مَوعِد")).toBe("موعد");
    });

    it("إزالة تكرار: يييي = ي", () => {
      expect(cleanArabicText("يييي")).toBe("ي");
    });
  });

  describe("booking intent", () => {
    it('"بدي أحجز" → BOOKING_REQUEST', () => {
      expect(normalizeArabicMessage("بدي أحجز").intent).toBe("BOOKING_REQUEST");
    });

    it('"عايز موعد" → BOOKING_REQUEST', () => {
      expect(normalizeArabicMessage("عايز موعد").intent).toBe("BOOKING_REQUEST");
    });

    it('"أبغى أكشف" → BOOKING_REQUEST', () => {
      expect(normalizeArabicMessage("أبغى أكشف").intent).toBe("BOOKING_REQUEST");
    });

    it('"book appointment" → BOOKING_REQUEST', () => {
      expect(normalizeArabicMessage("book appointment").intent).toBe("BOOKING_REQUEST");
    });
  });

  describe("affirmation / negation", () => {
    it('"أيوه" → AFFIRMATION', () => {
      expect(normalizeArabicMessage("أيوه").intent).toBe("AFFIRMATION");
    });

    it('"ماشي تمام" → AFFIRMATION', () => {
      expect(normalizeArabicMessage("ماشي تمام").intent).toBe("AFFIRMATION");
    });

    it('"لأ مشكور" → NEGATION', () => {
      expect(normalizeArabicMessage("لأ مشكور").intent).toBe("NEGATION");
    });

    it('"مو حاجة" → NEGATION', () => {
      expect(normalizeArabicMessage("مو حاجة").intent).toBe("NEGATION");
    });
  });

  describe("emergency", () => {
    it('"ألم شديد في الصدر" → EMERGENCY', () => {
      expect(normalizeArabicMessage("ألم شديد في الصدر").intent).toBe("EMERGENCY");
    });

    it('"ما أقدر أتنفس" → EMERGENCY', () => {
      expect(normalizeArabicMessage("ما أقدر أتنفس").intent).toBe("EMERGENCY");
    });
  });

  describe("doctor request", () => {
    it('"أريد د. سامي" → DOCTOR_REQUEST + doctorName=سامي', () => {
      const r = normalizeArabicMessage("أريد د. سامي");
      expect(r.intent).toBe("DOCTOR_REQUEST");
      expect(r.entities.doctorName).toBe("سامي");
    });

    it('"دكتور قلب" → DOCTOR_REQUEST + specialty=cardiology', () => {
      const r = normalizeArabicMessage("دكتور قلب");
      expect(r.intent).toBe("DOCTOR_REQUEST");
      expect(r.entities.specialty).toBe("cardiology");
    });
  });

  describe("pricing", () => {
    it('"كم سعر الكشف" → PRICE_INQUIRY', () => {
      expect(normalizeArabicMessage("كم سعر الكشف").intent).toBe("PRICE_INQUIRY");
    });

    it('"بكم الزيارة" → PRICE_INQUIRY', () => {
      expect(normalizeArabicMessage("بكم الزيارة").intent).toBe("PRICE_INQUIRY");
    });
  });

  describe("cancel", () => {
    it('"ألغِ موعدي" → CANCEL_APPOINTMENT', () => {
      expect(normalizeArabicMessage("ألغِ موعدي").intent).toBe("CANCEL_APPOINTMENT");
    });

    it('"مو جاي اليوم" → CANCEL_APPOINTMENT', () => {
      expect(normalizeArabicMessage("مو جاي اليوم").intent).toBe("CANCEL_APPOINTMENT");
    });
  });

  describe("greeting / out of context", () => {
    it('"كيف الطقس" → OUT_OF_CONTEXT', () => {
      expect(normalizeArabicMessage("كيف الطقس").intent).toBe("OUT_OF_CONTEXT");
    });

    it('"أهلاً" → GREETING', () => {
      expect(normalizeArabicMessage("أهلاً").intent).toBe("GREETING");
    });
  });

  describe("confidence", () => {
    it("multiple booking signals raise confidence", () => {
      const r = normalizeArabicMessage("بدي احجز موعد");
      expect(r.intent).toBe("BOOKING_REQUEST");
      expect(r.confidence).toBeGreaterThan(0.4);
    });

    it("unknown short noise has low confidence", () => {
      const r = normalizeArabicMessage("xyz???");
      expect(r.intent).toBe("UNKNOWN");
      expect(r.confidence).toBeLessThan(0.3);
    });
  });
});
