# Pilot Launch Playbook (Field Version)

هذا الدليل للتشغيل التجريبي الفعلي لأول عيادة، مع قواعد واضحة لـ go / no-go.

## Scope

- البيئة: تشغيل تجريبي لعيادة واحدة فقط.
- الهدف: التحقق من السلامة التشغيلية قبل التوسع.
- المدة: 7 أيام.
- المبدأ: **Safety first > Growth**.

## Team Roles (حد أدنى)

- **Pilot Commander:** قرار الإيقاف/الاستمرار، owner للحالة.
- **Ops Engineer:** مراقبة health / queues / bridge.
- **Clinical Reviewer:** مراجعة الطوارئ + feedback quality.
- **Frontdesk Champion:** توثيق الحالات الواقعية وسلوك المرضى.

## Day 0 (Preflight + Freeze)

### Readiness Gate

- `ops-dashboard` و `apps/web` و bridge تعمل بدون أخطاء startup.
- التحقق من `SCHEDULING_SERVICE_TOKEN`, `DATABASE_URL`, `JWT_SECRET`.
- فحص `GET /api/system/health/deep` = `ok` أو `degraded` بدون dead-letter spike.
- تشغيل smoke:
  - `cd ops-dashboard && npm test`
  - `node scripts/chaos-smoke.cjs`
  - `node scripts/data-integrity-check.cjs`

### Safety Gate

- `EMERGENCY_GLOBAL_DISABLE` معروف للفريق وكيفية تفعيله فورًا.
- اختبار kill-switch مرة واحدة قبل الإطلاق ثم إعادته للوضع الطبيعي.
- التأكد أن `ai_calibration.current` موجود أو fallback defaults فعالة.
- تأكيد أن `suggest/apply/reject` للمعايرة تسجل في audit logs.

### Freeze Policy

- ممنوع تغييرات منطقية على decision/calibration أثناء أيام 1–3.
- يسمح فقط بـ hotfix حرج مع توثيق وتوقيع Pilot Commander.

## Days 1–3 (Controlled Pilot)

### Traffic Policy

- عيادة واحدة، حجم منخفض، بدون توسع.
- مراقبة كل حالة `EMERGENCY` يدويًا.
- تفعيل human-in-the-loop دائمًا للحالات غير المؤكدة.

### Monitoring Cadence

- كل 30 دقيقة:
  - `emergency rate`
  - `uncertain rate`
  - `feedback correction rate`
  - bridge delivery success
- كل 2 ساعة:
  - مراجعة عيّنات timeline
  - فحص drift سلوكي (هل القرار تغيّر داخل نفس النمط؟)

### No-Go Triggers (Immediate Pause)

- ارتفاع مفاجئ في `EMERGENCY` غير مبرر.
- فشل إرسال bridge مستمر.
- أخطاء booking conflicts أو تكرار مواعيد.
- ارتفاع feedback السلبي بشكل متسارع.

عند أي trigger:

1. تفعيل وضع إيقاف آمن (throttle/kill switch حسب الحالة).
2. إيقاف auto changes (لا apply للمعايرة).
3. فتح incident ticket + RCA أولي خلال 30 دقيقة.

## Days 4–7 (Gradual Expansion)

### Expansion Gate

- لا توسع قبل تحقق الشروط:
  - استقرار health.
  - لا spikes حرجة خلال آخر 24 ساعة.
  - correction rate ضمن حدود مقبولة.

### What Can Change

- السماح بـ calibration apply واحد فقط يوميًا كحد أقصى.
- كل apply يتطلب:
  - sample size كافي
  - confidence مقبول
  - review من Clinical Reviewer + Ops Engineer

## Calibration Discipline

- `suggest` لا يعني `apply`.
- بعد `apply`: نافذة freeze 24 ساعة.
- أي `HIGH_DRIFT` يعامل كتحذير عالي ويحتاج موافقة مزدوجة.
- rollback فوري إلى `last_safe` عند تدهور KPI بعد apply.

## End of Week Decision

- **GO:** استمرار pilot + التحضير للتوسع.
- **HOLD:** تمديد pilot أسبوع إضافي مع نفس القيود.
- **STOP:** العودة لوضع manual-heavy + إصلاح جذري قبل أي توسع.

## Mandatory Deliverables (End of Week)

- تقرير KPI أسبوعي.
- incident summary + mitigations.
- قائمة تغييرات calibration المعتمدة/المرفوضة.
- توصية رسمية: GO / HOLD / STOP.

## Role-Based Execution Files

- `docs/PILOT_ROLE_EXECUTION_MATRIX.md`
- `docs/PILOT_COMMANDER_CHECKLIST.md`
- `docs/PILOT_OPS_CHECKLIST.md`
- `docs/PILOT_CLINICAL_CHECKLIST.md`
- `docs/PILOT_FRONTDESK_CHECKLIST.md`
