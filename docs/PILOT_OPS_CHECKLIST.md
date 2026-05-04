# Pilot Ops Checklist

## Start of Day

- [ ] تأكد أن `apps/web`, `ops-dashboard`, bridge تعمل.
- [ ] افحص `GET /api/system/health/deep`.
- [ ] افحص queue/backlog و dead-letter indicators.
- [ ] راجع آخر audit entries للـ calibration actions.

## Every 30 Minutes

- [ ] تحديث emergency rate (24h rolling).
- [ ] تحديث uncertain rate.
- [ ] تحديث bridge success/failure ratio.
- [ ] تحديث feedback correction rate.

## Calibration Operations

- [ ] لا تنفذ `apply` داخل freeze window.
- [ ] عند `warning: safety_hard_stop` سجل الحالة كـ blocked.
- [ ] عند `HIGH_DRIFT` ارفع تنبيه Commander + Clinical.

## Incident Ops Actions

- [ ] SEV-1: فعل kill switch / throttle مباشرة.
- [ ] SEV-2: حول التدفقات الحساسة إلى manual mode.
- [ ] شغل integrity checks عند مشاكل المواعيد.
- [ ] وثق timeline للأحداث (time, action, outcome).

## End of Day

- [ ] احفظ KPI snapshot.
- [ ] أصدر ops summary (نجاح/مخاطر/توصيات).
- [ ] سلّم نقاط المتابعة لليوم التالي.
