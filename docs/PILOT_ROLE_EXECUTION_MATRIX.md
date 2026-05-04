# Pilot Role Execution Matrix

هذه الصفحة تحدد ملكية التنفيذ أثناء الـ pilot لكل دور.

## Roles

- **Commander**: قائد التشغيل وصاحب قرار go/hold/stop.
- **Ops**: مسؤول المنصة والاعتمادية والـ health.
- **Clinical**: مسؤول السلامة السريرية وجودة القرار.
- **Frontdesk**: مسؤول الواقع التشغيلي للمحادثات والمواعيد.

## Ownership Matrix

## Preflight (Day 0)

- [ ] **Commander**: اعتماد readiness gate النهائي.
- [ ] **Ops**: تأكيد صحة `health/deep` و readiness للخدمات.
- [ ] **Ops**: تنفيذ smoke checks (`test`, `chaos-smoke`, `data-integrity`).
- [ ] **Clinical**: مراجعة safety behavior لحالات emergency الحرجة.
- [ ] **Frontdesk**: التحقق من تدفق الحجز الواقعي في الواجهة.

## Daily Operations (Days 1-7)

- [ ] **Commander**: مراجعة حالة اليوم (continue/restrict/pause).
- [ ] **Ops**: تحديث KPIs التشغيلية كل 30 دقيقة.
- [ ] **Clinical**: مراجعة الحالات الحساسة وتسجيل feedback مصحح.
- [ ] **Frontdesk**: توثيق الحالات غير الواضحة أو المتعثرة.
- [ ] **Ops + Clinical**: قرار reject/apply لأي calibration suggestion.

## Incident Response

- [ ] **Commander**: إعلان severity وتفعيل incident mode.
- [ ] **Ops**: تنفيذ mitigation فوري (kill switch/throttle/rollback).
- [ ] **Clinical**: تقييم أثر سريري مباشر على الحالات المتأثرة.
- [ ] **Frontdesk**: تحويل الحالات إلى معالجة يدوية حتى الاستقرار.

## End-of-Week Gate

- [ ] **Commander**: قرار GO/HOLD/STOP.
- [ ] **Ops**: تقرير reliability + trends.
- [ ] **Clinical**: تقرير false positives/false negatives.
- [ ] **Frontdesk**: تقرير تجربة الاستخدام والاحتكاكات.
