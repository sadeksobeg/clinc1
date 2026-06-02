# ADR-004: Postgres RLS لعزل العيادات (مستقبلي)

## Status

**Proposed** — غير مفعّل في الإنتاج (2026-06-02).

## Context

- جداول CRM تحتوي `clinic_id` لكن العزل يعتمد على استعلامات التطبيق.
- n8n وops-dashboard يشاركان نفس Postgres `clinic_ops`.

## Decision (عند التنفيذ)

1. تفعيل RLS على `conversations`, `patients`, `messages`, `appointments`.
2. ops-dashboard يضبط `SET LOCAL app.clinic_id = :id` لكل طلب مصدّق.
3. n8n: إما session variable per execution أو تقييد n8n لمسار read-only.

## Consequences

- يمنع تسريب بيانات عيادة عبر استعلام خاطئ.
- يتطلب اختبار شامل لجميع مسارات SQL وn8n.

## Alternatives

- عزل على مستوى قاعدة لكل عيادة (تكلفة تشغيل أعلى).
- الإبقاء على فحص التطبيق + مراجعات كود (الوضع الحالي).
