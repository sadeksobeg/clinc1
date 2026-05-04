# Pilot Incident Runbook

Runbook سريع للاستجابة أثناء التشغيل التجريبي.

## Severity Levels

- **SEV-1:** خطر سريري أو قرارات طارئة غير آمنة.
- **SEV-2:** تعطل مؤثر على الحجز/الردود.
- **SEV-3:** تدهور جودة أو تأخير دون خطر مباشر.

## Incident A: Emergency Misfire Spike

### Indicators

- ارتفاع غير طبيعي في `EMERGENCY` خلال فترة قصيرة.
- feedback سلبي متكرر على حالات emergency.

### Actions (بالترتيب)

1. فعّل تخفيف فوري:
   - kill switch / emergency throttle حسب السياسة الحالية.
2. أوقف أي `calibration apply`.
3. راجع آخر calibration applied ووقت التطبيق.
4. rollback إلى `last_safe` إذا كان spike بعد apply.
5. راجع 5 حالات timeline لتحديد النمط.

## Incident B: Booking Integrity Issue

### Indicators

- تعارض مواعيد أو duplicate booking.

### Actions

1. وقف confirm flows مؤقتًا للحالات الجديدة عالية المخاطر.
2. تشغيل integrity checks:
   - `node scripts/data-integrity-check.cjs`
3. تحويل الحالات المتأثرة إلى مراجعة يدوية.
4. توثيق IDs للحالات المتأثرة وإغلاقها يدويًا.

## Incident C: Bridge Delivery Degradation

### Indicators

- ارتفاع failed sends / queue backlog.

### Actions

1. تأكيد bridge readiness.
2. مراجعة outbox pending/failed.
3. التحويل المؤقت لوضع non-automated send للحالات الحساسة.
4. إعادة المحاولة عبر outbox بعد استعادة bridge.

## Incident D: Calibration Drift / Poisoning Suspicion

### Indicators

- اقتراحات calibration متطرفة أو غير منطقية.
- feedback مكرر من نفس reviewer بزمن قصير.

### Actions

1. رفض الاقتراح الحالي (`reject`).
2. تفعيل trusted reviewers فقط (إن لم يكن مفعّلًا).
3. مراجعة feedback quality (note + execution-linked).
4. freeze كامل للمعايرة حتى انتهاء التحقيق.

## Communication Template (Internal)

- الوقت:
- النوع (SEV-1/2/3):
- الأثر:
- الإجراء الفوري:
- هل تم تفعيل rollback؟
- ETA للاستعادة:

## Recovery Exit Criteria

- عودة KPI ضمن الحدود.
- لا أخطاء حرجة جديدة لمدة 2–4 ساعات.
- توقيع Pilot Commander + Ops Engineer على الاستعادة.
