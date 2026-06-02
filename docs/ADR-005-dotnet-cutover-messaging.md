# ADR-005: خطة cutover — process-inbound إلى ClinicSaaS.Api

## Status

**Accepted as north star** — التنفيذ لاحقاً ([`docs/ADR-002-core-backend-v2.md`](ADR-002-core-backend-v2.md)).

## المراحل

### 1 — عقد ثابت (اليوم)

- `POST /api/internal/conversations/process-inbound` — JSON الحالي.
- Bearer `SCHEDULING_SERVICE_TOKEN`.
- Bridge `POST /send` — `{ to, text }`.

### 2 — ازدواجية قراءة (اختياري)

- .NET يستدعي ops للكتابة؛ أو ops يكتب و.NET يقرأ للفوترة.

### 3 — Cutover كتابة

- نقل `processInboundMessage` إلى `ClinicSaaS.Api`.
- ops-dashboard يصبح proxy رفيع أو يُزال من المسار.

### 4 — إيقاف مسار Node للمنطق

- الإبقاء على bridge + apps/web فقط.

## معايير الجاهزية

- نفس اختبارات `e2e-booking-inbound-smoke` خضراء على .NET.
- `bridge_inbound_total` و`workflow_latency_ms` ضمن SLO.
- rollback: إعادة `OPS_WHATSAPP_PRIMARY_HANDLER=ops` وURL ops.

## Calendar OAuth (مرحلة E)

- tokens per `clinic_id` في جدول جديد أو TenantLinks.
- راجع stub: `whatsapp-bridge/docs/google-calendar.md` إن وُجد.
