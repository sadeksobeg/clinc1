# UX / Product Quality Gate — PR Checklist

> يجب اجتياز جميع البنود قبل الدمج. أي بند ❌ = No Merge.

## 🧠 1. Decision Clarity

* [ ] هل الشاشة تجيب بوضوح: *ماذا يجب أن أفعل الآن؟*
* [ ] هل تم تحويل الأرقام المهمة إلى **actions** (وليس مجرد عرض)؟
* [ ] هل توجد CTA واضحة للحالات الحرجة؟

## 🚨 2. Operational Signals

* [ ] هل توجد إشارات واضحة للحالات:

  * [ ] Danger
  * [ ] Warning
  * [ ] Info
* [ ] هل الإشارات مرتبطة بسلوك (CTA) وليس فقط نص؟
* [ ] هل تم استخدام `mc-signal-*` بدلاً من تصميم مخصص؟

## 🎯 3. Focus & Noise Control

* [ ] هل يمكن للمستخدم التركيز على “المشاكل فقط” (Focus Mode إن لزم)؟
* [ ] هل تم تقليل العناصر غير المهمة بصريًا (dim / opacity)؟
* [ ] هل تم إزالة أي UI غير ضروري؟

## 📊 4. Data → Insight

* [ ] هل البيانات المعروضة تتضمن:

  * [ ] Context (مثل avg / trend / last activity)
  * [ ] أو Insight (مثل stuck / slow / risk)
* [ ] هل تم تجنب عرض raw numbers بدون تفسير؟

## ⚡ 5. Interaction Quality

* [ ] هل جميع العناصر القابلة للنقر لديها:

  * [ ] hover state (mc-hover-lift)
  * [ ] active feedback
* [ ] هل transitions سلسة وغير مزعجة؟
* [ ] هل لا يوجد layout shift أثناء التحميل؟

## ⏳ 6. Loading & Empty States

* [ ] هل يوجد skeleton loading واضح؟
* [ ] هل تم منع flash (min 300ms loading)؟
* [ ] هل empty state:

  * [ ] يشرح السبب
  * [ ] يقدم إجراء واضح (CTA)

## 🧩 7. Consistency (Design System)

* [ ] هل تم استخدام tokens:

  * [ ] typography (mc-text-*)
  * [ ] spacing (mc-space-*)
  * [ ] layout (mc-stack-*)
* [ ] هل تم تجنب أي inline styles أو قيم عشوائية؟
* [ ] هل يتطابق التصميم مع Mission Control language؟
* [ ] هل تم الالتزام بعقود المكونات: `mc-panel` / `mc-signal` / `mc-empty` (بدون raw `mc-panel` أو `ui-empty`)؟

## 🧠 8. Priority & Urgency

* [ ] هل الحالات الحرجة:

  * [ ] واضحة بصريًا (color + motion)
  * [ ] تظهر أولًا في الترتيب؟
* [ ] هل SLA أو الوقت الحرج ظاهر بوضوح؟

## 👤 9. Ownership Clarity

* [ ] هل واضح:

  * [ ] من المسؤول عن العنصر؟
  * [ ] هل هو Assigned / Unassigned؟
* [ ] هل يمكن اتخاذ إجراء سريع من نفس المكان؟

## 🌍 10. Copy Quality (AR / EN)

* [ ] هل النص:

  * [ ] واضح ومباشر
  * [ ] Action-driven (verb-based)
* [ ] هل لا توجد مصطلحات تقنية غير ضرورية؟
* [ ] هل الترجمة العربية/الإنجليزية متسقة؟

## 🔐 11. Edge Cases

* [ ] 0 data
* [ ] 1 item
* [ ] large dataset
* [ ] error state

## 🧪 12. Smoke Verification

* [ ] Build passes (`npm run build`)
* [ ] No lint errors
* [ ] UX Gate passed locally (`npm run ux:check`)
* [ ] Strict UX Gate passed if targeting `main` (`npm run ux:check:strict`)
* [ ] Routes tested (200 OK)
* [ ] No console errors

## 🛡️ 13. Operational Readiness

* [ ] Security headers and rate-limit impact reviewed for touched endpoints
* [ ] Critical actions emit policy-aware audit events
* [ ] Decision/Prediction telemetry remains intact for touched workflows
* [ ] Readiness Gate workflow passes (`.github/workflows/readiness-gate.yml`)

## 🧾 Final Decision

* [ ] ✅ Ready for merge
* [ ] ❌ Needs changes

### Reviewer Notes

<!-- اكتب ملاحظاتك هنا -->
