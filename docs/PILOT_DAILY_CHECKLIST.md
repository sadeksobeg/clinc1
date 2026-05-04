# Pilot Daily Checklist

Checklist يومي للفريق أثناء التشغيل التجريبي.

## Start of Day (قبل استقبال الحالات)

- [ ] `apps/web` و `ops-dashboard` up.
- [ ] `health/deep` ضمن حالة آمنة (لا spike في dead-letter).
- [ ] bridge ready.
- [ ] مراجعة آخر incidents مفتوحة.
- [ ] مراجعة آخر calibration action (`suggest/apply/reject`).
- [ ] تأكيد عدم وجود apply داخل freeze window إذا غير مبرر.

## During Day (كل 30 دقيقة)

- [ ] تحديث dashboard: emergency / uncertain / correction rates.
- [ ] التحقق من نجاح الإرسال للمرضى (bridge success).
- [ ] مراجعة 2–3 محادثات ذات أولوية من timeline.
- [ ] التأكد من عدم وجود سلوك غير متسق في نفس المحادثة.

## Clinical Safety Checks

- [ ] كل حالة `loss_of_consciousness` مصنفة طارئة فعليًا.
- [ ] حالات `breathing_issue` تظل high-priority.
- [ ] لا يوجد auto escalation غير مبرر.

## End of Day

- [ ] تصدير ملخص KPI اليوم.
- [ ] حصر feedbacks المصححة (عدد + نسبة).
- [ ] توثيق أي false positives / false negatives ملحوظة.
- [ ] قرار اليوم التالي: keep / restrict / pause.

## Immediate Stop Triggers

- [ ] spike مفاجئ في emergency rate بدون سبب واقعي.
- [ ] فشل bridge متكرر مؤثر.
- [ ] booking integrity issue (تعارض/تكرار فعلي).
- [ ] ارتفاع correction rate فوق الحد التشغيلي المتفق عليه.

عند تحقق أي trigger:

- [ ] notify Pilot Commander فورًا.
- [ ] تطبيق safe mode / kill switch حسب النوع.
- [ ] فتح incident وتسجيل timestamp + الأثر.
