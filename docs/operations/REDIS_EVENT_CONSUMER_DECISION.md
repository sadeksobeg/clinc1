# قرار Redis و event-consumer (إصدار Clinic 1)

## القرار المعتمد

| البند | القيمة |
|--------|--------|
| **الوضع** | **Optional** — المسار المتزامن `process-inbound` هو خط الإطلاق الحرج |
| **REDIS_URL في الإنتاج (عيادة أولى)** | فارغ (`REDIS_URL=`) — يعطّل locks/deferred غير الضرورية |
| **event-consumer** | غير مطلوب لإطلاق العيادة الأولى |

## المبرر

- واتساب وارد + رد تلقائي يعملان عبر `ops-dashboard` → `sendViaBridge` بدون Redis.
- تفعيل Redis يضيف تعقيد تشغيل (حاوية + `REDIS_URL` + consumer) دون فائدة فورية لعيادة واحدة.

## متى ننتقل إلى Required

1. أكثر من عيادة نشطة على نفس الـ stack مع حمل وارد مرتفع.
2. حاجة لـ `dead_letter_events` ومراقبة stream lag في deep health.
3. fan-out لتحليلات/تكاملات جانبية دون تمديد زمن `process-inbound`.

## خطوات التفعيل (عند القرار)

```env
# .env.prod
REDIS_URL=redis://redis:6379
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d redis event-consumer
```

راجع [`docs/PROCESS_INBOUND_ASYNC.md`](../PROCESS_INBOUND_ASYNC.md) و [`docs/RELEASE_GATES_RUNBOOK.md`](../RELEASE_GATES_RUNBOOK.md).

## تاريخ

- 2026-06-02 — اعتماد Optional لـ tenegta.tech / clinic_ops
